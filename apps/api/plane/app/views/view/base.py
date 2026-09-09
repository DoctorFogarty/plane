# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Exists, OuterRef, Q
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page
from django.db import transaction

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import IssueViewSerializer
from plane.db.models import (
    Issue,
    IssueView,
    Workspace,
    WorkspaceMember,
    ProjectMember,
    Project,
    UserRecentVisit,
)
from plane.utils.issue_query import guest_issue_access_q, is_restricted_guest, list_issue_board
from plane.utils.order_queryset import VIEW_ORDER_BY_ALLOWLIST, sanitize_order_by
from plane.bgtasks.recent_visited_task import recent_visited_task
from .. import BaseViewSet
from plane.db.models import UserFavorite
from plane.utils.filters import IssueComplexFilterBackend
from plane.utils.filters import IssueFilterSet


class WorkspaceViewViewSet(BaseViewSet):
    serializer_class = IssueViewSerializer
    model = IssueView

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace_id=workspace.id, owned_by=self.request.user)

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .order_by(
                sanitize_order_by(
                    self.request.GET.get("order_by", "-created_at"),
                    VIEW_ORDER_BY_ALLOWLIST,
                    "-created_at",
                )
            )
            .distinct()
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        if WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role=ROLE.GUEST.value, is_active=True
        ).exists():
            queryset = queryset.filter(owned_by=request.user)
        views = IssueViewSerializer(queryset, many=True, fields=fields if fields else None).data
        return Response(views, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[], level="WORKSPACE", creator=True, model=IssueView)
    def partial_update(self, request, slug, pk):
        with transaction.atomic():
            workspace_view = IssueView.objects.select_for_update().get(pk=pk, workspace__slug=slug)

            if workspace_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # Only update the view if owner is updating
            if workspace_view.owned_by_id != request.user.id:
                return Response(
                    {"error": "Only the owner of the view can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = IssueViewSerializer(workspace_view, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, pk):
        issue_view = self.get_queryset().filter(pk=pk).first()
        serializer = IssueViewSerializer(issue_view)
        recent_visited_task.delay(
            slug=slug,
            project_id=None,
            entity_name="view",
            entity_identifier=pk,
            user_id=request.user.id,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=IssueView)
    def destroy(self, request, slug, pk):
        workspace_view = IssueView.objects.get(pk=pk, workspace__slug=slug)

        workspace_member = WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role=20, is_active=True
        )
        if workspace_member.exists() or workspace_view.owned_by == request.user:
            workspace_view.delete()
            # Delete the user favorite view
            UserFavorite.objects.filter(
                workspace__slug=slug,
                entity_identifier=pk,
                project__isnull=True,
                entity_type="view",
            ).delete()
        else:
            return Response(
                {"error": "Only admin or owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceViewIssuesViewSet(BaseViewSet):
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def _get_project_permission_filters(self):
        return guest_issue_access_q(self.request.user)

    def get_queryset(self):
        return Issue.issue_objects.filter(workspace__slug=self.kwargs.get("slug"))

    @method_decorator(gzip_page)
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        return list_issue_board(
            self,
            request,
            slug=slug,
            project_id=None,
            queryset=self.get_queryset().filter(self._get_project_permission_filters()),
        )


class IssueViewViewSet(BaseViewSet):
    serializer_class = IssueViewSerializer
    model = IssueView

    def perform_create(self, serializer):
        serializer.save(project_id=self.kwargs.get("project_id"), owned_by=self.request.user)

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_identifier=OuterRef("pk"),
            entity_type="view",
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        )
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
            .filter(Q(owned_by=self.request.user) | Q(access=1))
            .select_related("project")
            .select_related("workspace")
            .annotate(is_favorite=Exists(subquery))
            .order_by("-is_favorite", "name")
            .distinct()
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        queryset = self.get_queryset()
        project = Project.objects.get(id=project_id)
        if is_restricted_guest(slug=slug, project_id=project_id, user=request.user, project=project):
            queryset = queryset.filter(owned_by=request.user)
        fields = [field for field in request.GET.get("fields", "").split(",") if field]
        views = IssueViewSerializer(queryset, many=True, fields=fields if fields else None).data
        return Response(views, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        issue_view = self.get_queryset().filter(pk=pk, project_id=project_id).first()
        project = Project.objects.get(id=project_id)
        if (
            is_restricted_guest(slug=slug, project_id=project_id, user=request.user, project=project)
            and issue_view
            and issue_view.owned_by != request.user
        ):
            return Response(
                {"error": "You are not allowed to view this view"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = IssueViewSerializer(issue_view)
        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="view",
            entity_identifier=pk,
            user_id=request.user.id,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[], creator=True, model=IssueView)
    def partial_update(self, request, slug, project_id, pk):
        with transaction.atomic():
            issue_view = IssueView.objects.select_for_update().get(pk=pk, workspace__slug=slug, project_id=project_id)

            if issue_view.is_locked:
                return Response({"error": "view is locked"}, status=status.HTTP_400_BAD_REQUEST)

            # Only update the view if owner is updating
            if issue_view.owned_by_id != request.user.id:
                return Response(
                    {"error": "Only the owner of the view can update the view"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = IssueViewSerializer(issue_view, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=IssueView)
    def destroy(self, request, slug, project_id, pk):
        project_view = IssueView.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=20,
                is_active=True,
            ).exists()
            or project_view.owned_by_id == request.user.id
        ):
            project_view.delete()
            # Delete the user favorite view
            UserFavorite.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_type="view",
            ).delete()
            # Delete the page from recent visit
            UserRecentVisit.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                entity_identifier=pk,
                entity_name="view",
            ).delete(soft=False)
        else:
            return Response(
                {"error": "Only admin or owner can delete the view"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueViewFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(user=self.request.user)
            .select_related("view")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        _ = UserFavorite.objects.create(
            user=request.user,
            entity_identifier=request.data.get("view"),
            entity_type="view",
            project_id=project_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, view_id):
        view_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_type="view",
            entity_identifier=view_id,
        )
        view_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
