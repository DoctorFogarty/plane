# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.utils import IntegrityError

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet
from plane.app.serializers import ProjectStateGroupSerializer
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    ProjectStateGroup,
    State,
    StateGroup,
    REQUIRED_STATE_GROUP_CATEGORIES,
)
from plane.utils.cache import invalidate_cache


class ProjectStateGroupViewSet(BaseViewSet):
    serializer_class = ProjectStateGroupSerializer
    model = ProjectStateGroup

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .exclude(category=StateGroup.TRIAGE.value)
            .select_related("project")
            .select_related("workspace")
            .distinct()
            .order_by("sequence")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        serializer = ProjectStateGroupSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        try:
            data = request.data.copy()
            if data.get("category") == StateGroup.TRIAGE.value:
                return Response(
                    {"error": "Cannot create triage group"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = ProjectStateGroupSerializer(data=data)
            if serializer.is_valid():
                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"name": "The group name is already taken"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        try:
            group = ProjectStateGroup.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
            if group.is_system or group.category == StateGroup.TRIAGE.value:
                # Allow sequence/name/color updates on non-triage; block triage entirely
                if group.category == StateGroup.TRIAGE.value:
                    return Response(
                        {"error": "System triage group cannot be modified"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            serializer = ProjectStateGroupSerializer(group, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                # Sync denormalized category on member states when category changes
                if "category" in serializer.validated_data:
                    State.all_state_objects.filter(workflow_group=group).update(
                        group=serializer.validated_data["category"]
                    )
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except ProjectStateGroup.DoesNotExist:
            return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
        except IntegrityError:
            return Response(
                {"name": "The group name is already taken"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        try:
            group = ProjectStateGroup.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        except ProjectStateGroup.DoesNotExist:
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
