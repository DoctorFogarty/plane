# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.issue_type import IssuePropertyOptionSerializer, IssuePropertySerializer
from plane.db.models import IssueProperty, IssuePropertyOption, ProjectIssueType

from .type_common import get_project, types_enabled_or_error
from ..base import BaseViewSet


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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
        if error:
            return error
        serializer = IssuePropertySerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, type_id):
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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

        for option in request.data.get("options", []):
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
        if error:
            return error

        property_obj = self.get_queryset().filter(pk=pk).first()
        if not property_obj:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

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

            stale_options = IssuePropertyOption.objects.filter(property_id=pk).exclude(id__in=kept_option_ids)
            for stale in stale_options:
                stale.delete()

        property_obj = IssueProperty.objects.prefetch_related("options").get(pk=pk)
        return Response(IssuePropertySerializer(property_obj).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, type_id, pk):
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
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
        project = get_project(slug, project_id)
        error = types_enabled_or_error(project)
        if error:
            return error

        if not IssueProperty.objects.filter(pk=property_id, project_id=project_id, issue_type_id=type_id).exists():
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
