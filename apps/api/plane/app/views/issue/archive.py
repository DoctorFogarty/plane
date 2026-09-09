# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import OuterRef, Q, Prefetch, Exists
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectEntityPermission
from plane.app.serializers import (
    IssueFlatSerializer,
    IssueSerializer,
    IssueDetailSerializer,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    IssueLink,
    IssueSubscriber,
    IssueReaction,
)
from plane.utils.issue_query import list_issue_board
from plane.app.permissions import allow_permission, ROLE
from plane.utils.error_codes import ERROR_CODES
from plane.utils.host import base_host

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.utils.filters import IssueComplexFilterBackend
from plane.utils.filters import IssueFilterSet


class IssueArchiveViewSet(BaseViewSet):
    serializer_class = IssueFlatSerializer
    model = Issue

    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get_queryset(self):
        return (
            Issue.objects.filter(Q(type__isnull=True) | Q(type__is_epic=False))
            .filter(archived_at__isnull=False)
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(workspace__slug=self.kwargs.get("slug"))
        )

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id):
        return list_issue_board(
            self,
            request,
            slug=slug,
            project_id=project_id,
            queryset=self.get_queryset(),
            prefetch=("assignees", "labels", "issue_module__module"),
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def retrieve(self, request, slug, project_id, pk=None):
        issue = (
            self.get_queryset()
            .filter(pk=pk)
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project_id,
                        issue_id=OuterRef("pk"),
                        subscriber=request.user,
                    )
                )
            )
        ).first()
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IssueDetailSerializer(issue, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def archive(self, request, slug, project_id, pk=None):
        issue = Issue.issue_objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        if issue.state.group not in ["completed", "cancelled"]:
            return Response(
                {"error": "Can only archive completed or cancelled state group issue"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"archived_at": str(timezone.now().date()), "automation": False}),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        issue.archived_at = timezone.now().date()
        issue.save()

        return Response({"archived_at": str(issue.archived_at)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def unarchive(self, request, slug, project_id, pk=None):
        issue = Issue.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            archived_at__isnull=False,
            pk=pk,
        )
        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"archived_at": None}),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        issue.archived_at = None
        issue.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class BulkArchiveIssuesEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response({"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids).select_related(
            "state"
        )
        bulk_archive_issues = []
        for issue in issues:
            if issue.state.group not in ["completed", "cancelled"]:
                return Response(
                    {
                        "error_code": ERROR_CODES["INVALID_ARCHIVE_STATE_GROUP"],
                        "error_message": "INVALID_ARCHIVE_STATE_GROUP",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps({"archived_at": str(timezone.now().date()), "automation": False}),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                current_instance=json.dumps(IssueSerializer(issue).data, cls=DjangoJSONEncoder),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            issue.archived_at = timezone.now().date()
            bulk_archive_issues.append(issue)
        Issue.objects.bulk_update(bulk_archive_issues, ["archived_at"])

        return Response({"archived_at": str(timezone.now().date())}, status=status.HTTP_200_OK)
