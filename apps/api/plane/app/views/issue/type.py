# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueActivitySerializer
from plane.app.serializers.issue_type import (
    IssuePropertyOptionSerializer,
    IssuePropertySerializer,
    IssueTypeSerializer,
)
from plane.bgtasks.notification_task import notifications
from plane.bgtasks.slack_task import dispatch_slack_channel_event
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProperty,
    IssuePropertyOption,
    IssueType,
    Project,
    ProjectIssueType,
)
from plane.settings.redis import redis_instance
from plane.utils.host import base_host
from plane.utils.issue_property import (
    format_property_value_for_display,
    get_issue_property_values_map,
    get_issues_property_values_maps,
    upsert_property_values,
)
from plane.utils.slack.transitions import activities_from_models, build_slack_headline

from .. import BaseAPIView, BaseViewSet


def _get_project(slug, project_id):
    return Project.objects.get(pk=project_id, workspace__slug=slug)


def _types_enabled_or_error(project):
    if not project.is_issue_type_enabled:
        return Response(
            {"error": "Work item types are not enabled for this project"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _get_default_issue_type_id(project_id):
    pit = ProjectIssueType.objects.filter(project_id=project_id, is_default=True).first()
    return pit.issue_type_id if pit else None


def _ensure_issue_has_type(issue, project):
    """Assign the project default type when types are enabled and the issue has none."""
    if not project.is_issue_type_enabled or issue.type_id:
        return issue
    default_type_id = _get_default_issue_type_id(project.id)
    if not default_type_id:
        return issue
    issue.type_id = default_type_id
    issue.save(update_fields=["type_id", "updated_at"])
    return issue


class IssueTypeEnableEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = _get_project(slug, project_id)
        if project.is_issue_type_enabled:
            return Response(
                {"error": "Work item types are already enabled for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            workspace = project.workspace
            task_type, _ = IssueType.objects.get_or_create(
                workspace=workspace,
                name="Task",
                defaults={
                    "description": "Default work item type",
                    "is_default": True,
                    "is_active": True,
                    "is_epic": False,
                    "logo_props": {"in_use": "emoji", "emoji": {"value": "1f4cb"}},
                },
            )
            epic_type, _ = IssueType.objects.get_or_create(
                workspace=workspace,
                name="Epic",
                defaults={
                    "description": "Epic work item type",
                    "is_default": False,
                    "is_active": True,
                    "is_epic": True,
                    "logo_props": {"in_use": "emoji", "emoji": {"value": "1f3af"}},
                },
            )

            ProjectIssueType.objects.update_or_create(
                project=project,
                issue_type=task_type,
                defaults={"is_default": True, "level": 0, "workspace": workspace},
            )
            ProjectIssueType.objects.update_or_create(
                project=project,
                issue_type=epic_type,
                defaults={"is_default": False, "level": 1, "workspace": workspace},
            )

            # Link any other active workspace types so the catalog is shared across projects
            other_types = IssueType.objects.filter(workspace=workspace, is_active=True).exclude(
                id__in=[task_type.id, epic_type.id]
            )
            for other_type in other_types:
                ProjectIssueType.objects.update_or_create(
                    project=project,
                    issue_type=other_type,
                    defaults={"is_default": False, "level": 0, "workspace": workspace},
                )

            project.is_issue_type_enabled = True
            project.save(update_fields=["is_issue_type_enabled", "updated_at"])

            # Existing work items need a type so custom properties can render
            Issue.objects.filter(project_id=project_id, type_id__isnull=True).update(type_id=task_type.id)

        types = IssueType.objects.filter(project_issue_types__project_id=project_id).distinct()
        serializer = IssueTypeSerializer(types, many=True, context={"project_id": project_id})
        return Response(
            {
                "is_issue_type_enabled": True,
                "issue_types": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class IssueTypeViewSet(BaseViewSet):
    model = IssueType
    serializer_class = IssueTypeSerializer

    def get_queryset(self):
        return (
            IssueType.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_issue_types__project_id=self.kwargs.get("project_id"),
            )
            .distinct()
            .order_by("name")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error
        serializer = IssueTypeSerializer(
            self.get_queryset(),
            many=True,
            context={"project_id": project_id, "include_properties": False},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        name = request.data.get("name")
        if not name:
            return Response({"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)

        if IssueType.objects.filter(
            workspace_id=project.workspace_id,
            name=name,
            project_issue_types__project_id=project_id,
        ).exists():
            return Response(
                {"error": "Work item type with this name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            issue_type = IssueType.objects.filter(workspace_id=project.workspace_id, name=name).first()
            if not issue_type:
                issue_type = IssueType.objects.create(
                    workspace_id=project.workspace_id,
                    name=name,
                    description=request.data.get("description", ""),
                    logo_props=request.data.get("logo_props", {}),
                    is_epic=request.data.get("is_epic", False),
                    is_active=request.data.get("is_active", True),
                )
            else:
                # Reuse workspace-level type definition when linking into this project
                for field in ("description", "logo_props", "is_epic", "is_active"):
                    if field in request.data:
                        setattr(issue_type, field, request.data.get(field))
                issue_type.save()

            ProjectIssueType.objects.get_or_create(
                project=project,
                issue_type=issue_type,
                defaults={
                    "is_default": False,
                    "level": request.data.get("level", 0),
                    "workspace": project.workspace,
                },
            )

        serializer = IssueTypeSerializer(issue_type, context={"project_id": project_id})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        issue_type = self.get_queryset().filter(pk=pk).first()
        if not issue_type:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        pit = ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).first()

        with transaction.atomic():
            for field in ("name", "description", "logo_props", "is_epic"):
                if field in request.data:
                    setattr(issue_type, field, request.data.get(field))

            if "is_active" in request.data:
                is_active = bool(request.data.get("is_active"))
                if not is_active and pit and pit.is_default:
                    return Response(
                        {"error": "The default work item type cannot be disabled"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                issue_type.is_active = is_active

            issue_type.save()

            if request.data.get("is_default") is True and pit:
                ProjectIssueType.objects.filter(project_id=project_id, is_default=True).update(is_default=False)
                pit.is_default = True
                pit.save(update_fields=["is_default", "updated_at"])

            if "level" in request.data and pit:
                pit.level = request.data.get("level", pit.level)
                pit.save(update_fields=["level", "updated_at"])

        serializer = IssueTypeSerializer(issue_type, context={"project_id": project_id})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        pit = ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).first()
        if not pit:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        if pit.is_default:
            return Response(
                {"error": "The default work item type cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueTypePropertiesAndOptionsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = _get_project(slug, project_id)
        if not project.is_issue_type_enabled:
            return Response(
                {
                    "is_issue_type_enabled": False,
                    "issue_types": [],
                },
                status=status.HTTP_200_OK,
            )

        types = IssueType.objects.filter(project_issue_types__project_id=project_id).distinct()
        serializer = IssueTypeSerializer(
            types,
            many=True,
            context={"project_id": project_id, "include_properties": True},
        )
        return Response(
            {
                "is_issue_type_enabled": True,
                "issue_types": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class IssuePropertyViewSet(BaseViewSet):
    model = IssueProperty
    serializer_class = IssuePropertySerializer

    def get_queryset(self):
        return (
            IssueProperty.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_type_id=self.kwargs.get("type_id"),
            )
            .prefetch_related("options")
            .order_by("sort_order")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, type_id):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error
        serializer = IssuePropertySerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        if not ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=type_id).exists():
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssuePropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        property_obj = serializer.save(
            project_id=project_id,
            workspace_id=project.workspace_id,
            issue_type_id=type_id,
        )

        options_data = request.data.get("options", [])
        for option in options_data:
            IssuePropertyOption.objects.create(
                property=property_obj,
                project_id=project_id,
                workspace_id=project.workspace_id,
                name=option.get("name", ""),
                description=option.get("description", ""),
                logo_props=option.get("logo_props", {}),
                is_default=option.get("is_default", False),
                is_active=option.get("is_active", True),
            )

        property_obj = IssueProperty.objects.prefetch_related("options").get(pk=property_obj.id)
        return Response(IssuePropertySerializer(property_obj).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, type_id, pk):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        property_obj = self.get_queryset().filter(pk=pk).first()
        if not property_obj:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        # Property type is immutable after create — changing it would invalidate existing values
        if "property_type" in request.data and request.data.get("property_type") != property_obj.property_type:
            return Response(
                {"error": "Property type cannot be changed after creation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IssuePropertySerializer(property_obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        if "options" in request.data:
            options_payload = request.data.get("options") or []
            kept_option_ids = set()

            for option in options_payload:
                option_id = option.get("id")
                if option_id:
                    updated = IssuePropertyOption.objects.filter(pk=option_id, property_id=pk).update(
                        name=option.get("name"),
                        description=option.get("description", ""),
                        logo_props=option.get("logo_props", {}),
                        is_default=option.get("is_default", False),
                        is_active=option.get("is_active", True),
                        sort_order=option.get("sort_order", 65535),
                    )
                    if updated:
                        kept_option_ids.add(str(option_id))
                elif option.get("name"):
                    created = IssuePropertyOption.objects.create(
                        property_id=pk,
                        project_id=project_id,
                        workspace_id=project.workspace_id,
                        name=option.get("name"),
                        description=option.get("description", ""),
                        logo_props=option.get("logo_props", {}),
                        is_default=option.get("is_default", False),
                        is_active=option.get("is_active", True),
                    )
                    kept_option_ids.add(str(created.id))

            # Soft-delete options omitted from the payload
            stale_options = IssuePropertyOption.objects.filter(property_id=pk).exclude(id__in=kept_option_ids)
            for stale in stale_options:
                stale.delete()

        property_obj = IssueProperty.objects.prefetch_related("options").get(pk=pk)
        return Response(IssuePropertySerializer(property_obj).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, type_id, pk):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error
        property_obj = self.get_queryset().filter(pk=pk).first()
        if not property_obj:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        property_obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyOptionViewSet(BaseViewSet):
    model = IssuePropertyOption
    serializer_class = IssuePropertyOptionSerializer

    def get_queryset(self):
        return IssuePropertyOption.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            property_id=self.kwargs.get("property_id"),
        ).order_by("sort_order")

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id, property_id):
        project = _get_project(slug, project_id)
        error = _types_enabled_or_error(project)
        if error:
            return error

        if not IssueProperty.objects.filter(
            pk=property_id, project_id=project_id, issue_type_id=type_id
        ).exists():
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssuePropertyOptionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        option = serializer.save(
            property_id=property_id,
            project_id=project_id,
            workspace_id=project.workspace_id,
        )
        return Response(IssuePropertyOptionSerializer(option).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, type_id, property_id, pk):
        option = self.get_queryset().filter(pk=pk).first()
        if not option:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssuePropertyOptionSerializer(option, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, type_id, property_id, pk):
        option = self.get_queryset().filter(pk=pk).first()
        if not option:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        project = _get_project(slug, project_id)
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        # Repair legacy issues that predate work item types
        _ensure_issue_has_type(issue, project)
        return Response(get_issue_property_values_map(issue_id, project_id), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    def _upsert(self, request, slug, project_id, issue_id):
        project = _get_project(slug, project_id)
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        if not project.is_issue_type_enabled:
            return Response({}, status=status.HTTP_200_OK)

        issue = _ensure_issue_has_type(issue, project)
        if not issue.type_id:
            return Response({}, status=status.HTTP_200_OK)

        if "property_values" in request.data:
            property_values = request.data.get("property_values") or {}
            validate_required = request.data.get("validate_required", True)
        else:
            property_values = {
                key: value
                for key, value in request.data.items()
                if key not in ("validate_required",)
            }
            validate_required = request.data.get("validate_required", True)

        if not isinstance(property_values, dict):
            return Response({"error": "property_values must be an object"}, status=status.HTTP_400_BAD_REQUEST)

        # Capture old values for activity
        old_values = get_issue_property_values_map(issue_id, project_id)

        result, errors = upsert_property_values(
            issue=issue,
            project_id=project_id,
            workspace_id=project.workspace_id,
            property_values=property_values,
            actor_id=request.user.id,
            validate_required=validate_required,
        )
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        epoch = timezone.now().timestamp()
        activities = []
        for property_id, new_value in result.items():
            old_value = old_values.get(property_id)
            if str(old_value) == str(new_value):
                continue
            property_obj = IssueProperty.objects.filter(pk=property_id).first()
            display_old = (
                format_property_value_for_display(property_obj, old_value) if property_obj else None
            )
            display_new = (
                format_property_value_for_display(property_obj, new_value) if property_obj else None
            )
            if display_old is None and old_value is not None:
                display_old = str(old_value)
            if display_new is None and new_value is not None:
                display_new = str(new_value)
            activities.append(
                IssueActivity(
                    issue_id=issue_id,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    actor_id=request.user.id,
                    verb="updated",
                    field=property_obj.name if property_obj else str(property_id),
                    old_value=display_old,
                    new_value=display_new,
                    comment="updated the property",
                    epoch=epoch,
                    new_identifier=property_id,
                )
            )
        if activities:
            created = IssueActivity.objects.bulk_create(activities, batch_size=20)
            origin = base_host(request=request, is_app=True)
            if origin:
                redis_instance().set(str(issue_id), origin, ex=600)
            notifications.delay(
                type="issue_property.activity.updated",
                issue_id=issue_id,
                actor_id=request.user.id,
                project_id=project_id,
                subscriber=True,
                issue_activities_created=json.dumps(
                    IssueActivitySerializer(created, many=True).data,
                    cls=DjangoJSONEncoder,
                ),
                requested_data=None,
                current_instance=None,
            )
            headline = build_slack_headline(
                request.user,
                project.workspace_id,
                activities_from_models(created),
                event_type="issue_property.activity.updated",
            )
            dispatch_slack_channel_event.delay(
                str(project_id),
                str(issue_id),
                ["custom_property"],
                headline,
                [str(activity.new_identifier) for activity in created if activity.new_identifier],
            )

        return Response(result, status=status.HTTP_200_OK)


class IssuePropertyValueBulkEndpoint(BaseAPIView):
    """Bulk-fetch property values for many work items in a project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = _get_project(slug, project_id)
        if not project.is_issue_type_enabled:
            return Response({}, status=status.HTTP_200_OK)

        issue_ids = request.data.get("issue_ids") or []
        if not isinstance(issue_ids, list):
            return Response({"error": "issue_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        # Cap batch size to avoid unbounded queries
        issue_ids = [str(i) for i in issue_ids[:500]]
        if not issue_ids:
            return Response({}, status=status.HTTP_200_OK)

        # Restrict to issues that belong to this project/workspace
        valid_ids = list(
            Issue.objects.filter(
                pk__in=issue_ids,
                project_id=project_id,
                workspace__slug=slug,
            ).values_list("id", flat=True)
        )
        return Response(
            get_issues_property_values_maps(valid_ids, project_id),
            status=status.HTTP_200_OK,
        )
