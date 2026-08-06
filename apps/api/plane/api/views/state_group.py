# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.serializers import ProjectStateGroupSerializer
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import (
    ProjectStateGroup,
    State,
    StateGroup,
    REQUIRED_STATE_GROUP_CATEGORIES,
)
from .base import BaseAPIView


class StateGroupListCreateAPIEndpoint(BaseAPIView):
    serializer_class = ProjectStateGroupSerializer
    model = ProjectStateGroup
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            ProjectStateGroup.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .exclude(category=StateGroup.TRIAGE.value)
            .filter(project__archived_at__isnull=True)
            .select_related("project", "workspace")
            .distinct()
            .order_by("sequence")
        )

    def get(self, request, slug, project_id):
        serializer = ProjectStateGroupSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id):
        try:
            if request.data.get("category") == StateGroup.TRIAGE.value:
                return Response(
                    {"error": "Cannot create triage group"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = ProjectStateGroupSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Group with the same name already exists"},
                status=status.HTTP_409_CONFLICT,
            )


class StateGroupDetailAPIEndpoint(BaseAPIView):
    serializer_class = ProjectStateGroupSerializer
    model = ProjectStateGroup
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return (
            ProjectStateGroup.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .exclude(category=StateGroup.TRIAGE.value)
            .filter(project__archived_at__isnull=True)
            .select_related("project", "workspace")
            .distinct()
        )

    def get(self, request, slug, project_id, group_id):
        group = self.get_queryset().filter(pk=group_id).first()
        if not group:
            return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectStateGroupSerializer(group).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, group_id):
        try:
            group = self.get_queryset().filter(pk=group_id).first()
            if not group:
                return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
            if group.category == StateGroup.TRIAGE.value:
                return Response(
                    {"error": "System triage group cannot be modified"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = ProjectStateGroupSerializer(group, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                if "category" in serializer.validated_data:
                    State.all_state_objects.filter(workflow_group=group).update(
                        group=serializer.validated_data["category"]
                    )
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Group with the same name already exists"},
                status=status.HTTP_409_CONFLICT,
            )

    def delete(self, request, slug, project_id, group_id):
        group = self.get_queryset().filter(pk=group_id).first()
        if not group:
            return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
        if group.is_system or group.category == StateGroup.TRIAGE.value:
            return Response(
                {"error": "System group cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if State.objects.filter(workflow_group=group).exists():
            return Response(
                {"error": "The group is not empty, only empty groups can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if group.category in REQUIRED_STATE_GROUP_CATEGORIES:
            remaining = (
                ProjectStateGroup.objects.filter(project_id=project_id, category=group.category)
                .exclude(pk=group.pk)
                .count()
            )
            if remaining == 0:
                return Response(
                    {"error": f"Cannot delete the last group in category '{group.category}'"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
