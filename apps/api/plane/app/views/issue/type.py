# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.issue_type import IssueTypeSerializer
from plane.db.models import Issue, IssueType, ProjectIssueType

from .type_common import get_project, types_enabled_or_error
from ..base import BaseAPIView, BaseViewSet


class IssueTypeEnableEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = get_project(slug, project_id)
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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
        project = get_project(slug, project_id)
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
