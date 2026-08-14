# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Count, Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectBasePermission, ROLE, allow_permission
from plane.app.serializers import (
    AutomationListSerializer,
    AutomationRunSerializer,
    AutomationSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Automation, AutomationAction, AutomationCondition, AutomationRun


class AutomationViewSet(BaseViewSet):
    model = Automation
    permission_classes = [ProjectBasePermission]

    def get_serializer_class(self):
        if self.action == "list":
            return AutomationListSerializer
        return AutomationSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(deleted_at__isnull=True)
            .annotate(
                conditions_count=Count("conditions", distinct=True),
                actions_count=Count("actions", distinct=True),
            )
            .prefetch_related(
                Prefetch(
                    "conditions",
                    queryset=AutomationCondition.objects.filter(deleted_at__isnull=True).order_by("group", "order"),
                ),
                Prefetch(
                    "actions",
                    queryset=AutomationAction.objects.filter(deleted_at__isnull=True).order_by("order"),
                ),
            )
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN])
    def list(self, request, slug, project_id):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def retrieve(self, request, slug, project_id, pk=None):
        automation = self.get_object()
        return Response(AutomationSerializer(automation).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = AutomationSerializer(data=request.data, context={"project_id": project_id, "request": request})
        if serializer.is_valid():
            automation = serializer.save()
            automation = self.get_queryset().get(pk=automation.id)
            return Response(AutomationSerializer(automation).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk=None):
        automation = self.get_object()
        serializer = AutomationSerializer(
            automation,
            data=request.data,
            partial=True,
            context={"project_id": project_id, "request": request},
        )
        if serializer.is_valid():
            serializer.save()
            automation = self.get_queryset().get(pk=pk)
            return Response(AutomationSerializer(automation).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk=None):
        automation = self.get_object()
        if automation.is_enabled:
            return Response(
                {"error": "Automation must be disabled before deleting it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, slug=slug, project_id=project_id, pk=pk)


class AutomationRunViewSet(BaseViewSet):
    model = AutomationRun
    serializer_class = AutomationRunSerializer
    permission_classes = [ProjectBasePermission]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(automation_id=self.kwargs.get("automation_id"))
            .filter(deleted_at__isnull=True)
            .prefetch_related("steps")
            .select_related("issue")
            .order_by("-started_at")
        )

    @allow_permission([ROLE.ADMIN])
    def list(self, request, slug, project_id, automation_id):
        serializer = self.get_serializer(self.get_queryset()[:100], many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def retrieve(self, request, slug, project_id, automation_id, pk=None):
        run = self.get_object()
        return Response(self.get_serializer(run).data, status=status.HTTP_200_OK)
