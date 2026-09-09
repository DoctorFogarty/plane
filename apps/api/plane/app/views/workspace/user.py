# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date

from dateutil.relativedelta import relativedelta

# Django imports
from django.db.models import (
    Case,
    Count,
    F,
    IntegerField,
    Q,
    Value,
    When,
)
from django.db.models.fields import DateField
from django.db.models.functions import Cast, ExtractWeek
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import WorkspaceEntityPermission, WorkspaceViewerPermission

# Module imports
from plane.app.serializers import (
    IssueActivitySerializer,
    ProjectMemberSerializer,
    WorkSpaceSerializer,
    WorkspaceUserPropertiesSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    CycleIssue,
    Issue,
    IssueActivity,
    IssueSubscriber,
    Project,
    ProjectMember,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceUserProperties,
)
from plane.utils.issue_filters import apply_issue_filters, issue_filters, legacy_filter_kwargs
from plane.utils.issue_query import INTAKE_BOARD_COUNT_FILTER, list_issue_board
from plane.utils.order_queryset import ACTIVITY_ORDER_BY_ALLOWLIST, sanitize_order_by
from plane.utils.filters import IssueComplexFilterBackend
from plane.utils.filters import IssueFilterSet


class UserLastProjectWithWorkspaceEndpoint(BaseAPIView):
    def get(self, request):
        user = User.objects.get(pk=request.user.id)

        last_workspace_id = user.last_workspace_id

        if last_workspace_id is None:
            return Response(
                {"project_details": [], "workspace_details": {}},
                status=status.HTTP_200_OK,
            )

        workspace = Workspace.objects.get(pk=last_workspace_id)
        workspace_serializer = WorkSpaceSerializer(workspace)

        project_member = ProjectMember.objects.filter(
            workspace_id=last_workspace_id, member=request.user
        ).select_related("workspace", "project", "member", "workspace__owner")

        project_member_serializer = ProjectMemberSerializer(project_member, many=True)

        return Response(
            {
                "workspace_details": workspace_serializer.data,
                "project_details": project_member_serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceUserProfileIssuesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get(self, request, slug, user_id):
        issue_queryset = Issue.issue_objects.filter(
            id__in=Issue.issue_objects.filter(
                Q(assignees__in=[user_id]) | Q(created_by_id=user_id) | Q(issue_subscribers__subscriber_id=user_id),
                workspace__slug=slug,
            ).values_list("id", flat=True),
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
        )
        return list_issue_board(
            self,
            request,
            slug=slug,
            project_id=None,
            queryset=issue_queryset,
            prefetch=("assignees", "labels", "issue_module__module"),
            count_filter=INTAKE_BOARD_COUNT_FILTER,
        )


class WorkspaceUserPropertiesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]

    def patch(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        (workspace_properties, _) = WorkspaceUserProperties.objects.get_or_create(
            user=request.user, workspace_id=workspace.id
        )

        serializer = WorkspaceUserPropertiesSerializer(workspace_properties, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        (workspace_properties, _) = WorkspaceUserProperties.objects.get_or_create(
            user=request.user, workspace=workspace
        )

        serializer = WorkspaceUserPropertiesSerializer(workspace_properties)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceUserProfileEndpoint(BaseAPIView):
    def get(self, request, slug, user_id):
        requesting_workspace_member = WorkspaceMember.objects.get(
            workspace__slug=slug, member=request.user, is_active=True
        )

        # Verify the target user is also an active member of this workspace
        # before exposing their profile data.
        target_workspace_member = WorkspaceMember.objects.select_related("member").get(
            workspace__slug=slug, member_id=user_id, is_active=True
        )
        user_data = target_workspace_member.member
        projects = []
        if requesting_workspace_member.role >= 15:
            projects = (
                Project.objects.filter(
                    workspace__slug=slug,
                    project_projectmember__member=request.user,
                    project_projectmember__is_active=True,
                    archived_at__isnull=True,
                )
                .annotate(
                    created_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__created_by_id=user_id,
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                    )
                )
                .annotate(
                    assigned_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__assignees__in=[user_id],
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                    )
                )
                .annotate(
                    completed_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__completed_at__isnull=False,
                            project_issue__assignees__in=[user_id],
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                    )
                )
                .annotate(
                    pending_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__state__group__in=[
                                "backlog",
                                "unstarted",
                                "started",
                            ],
                            project_issue__assignees__in=[user_id],
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                    )
                )
                .values(
                    "id",
                    "logo_props",
                    "created_issues",
                    "assigned_issues",
                    "completed_issues",
                    "pending_issues",
                )
            )

        return Response(
            {
                "project_data": projects,
                "user_data": {
                    "email": user_data.email,
                    "first_name": user_data.first_name,
                    "last_name": user_data.last_name,
                    "avatar_url": user_data.avatar_url,
                    "cover_image_url": user_data.cover_image_url,
                    "date_joined": user_data.date_joined,
                    "user_timezone": user_data.user_timezone,
                    "display_name": user_data.display_name,
                },
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceUserActivityEndpoint(BaseAPIView):
    permission_classes = [WorkspaceEntityPermission]

    def get(self, request, slug, user_id):
        projects = request.query_params.getlist("project", [])

        queryset = IssueActivity.objects.filter(
            ~Q(field__in=["comment", "vote", "reaction", "draft"]),
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            actor=user_id,
        ).select_related("actor", "workspace", "issue", "project")

        if projects:
            queryset = queryset.filter(project__in=projects)

        return self.paginate(
            order_by=sanitize_order_by(
                request.GET.get("order_by", "-created_at"),
                ACTIVITY_ORDER_BY_ALLOWLIST,
                "-created_at",
            ),
            request=request,
            queryset=queryset,
            on_results=lambda issue_activities: IssueActivitySerializer(issue_activities, many=True).data,
        )


class WorkspaceUserProfileStatsEndpoint(BaseAPIView):
    def get(self, request, slug, user_id):
        filters = issue_filters(request.query_params, "GET")
        subscriber_filters = legacy_filter_kwargs(filters)

        state_distribution = (
            apply_issue_filters(
                Issue.issue_objects.filter(
                    (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                    workspace__slug=slug,
                    project__project_projectmember__member=request.user,
                    project__project_projectmember__is_active=True,
                ),
                filters,
                query_params=request.query_params,
            )
            .annotate(state_group=F("state__group"))
            .values("state_group")
            .annotate(state_count=Count("state_group"))
            .order_by("state_group")
        )

        priority_order = ["urgent", "high", "medium", "low", "none"]

        priority_distribution = (
            apply_issue_filters(
                Issue.issue_objects.filter(
                    (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                    workspace__slug=slug,
                    project__project_projectmember__member=request.user,
                    project__project_projectmember__is_active=True,
                ),
                filters,
                query_params=request.query_params,
            )
            .values("priority")
            .annotate(priority_count=Count("priority"))
            .filter(priority_count__gte=1)
            .annotate(
                priority_order=Case(
                    *[When(priority=p, then=Value(i)) for i, p in enumerate(priority_order)],
                    default=Value(len(priority_order)),
                    output_field=IntegerField(),
                )
            )
            .order_by("priority_order")
        )

        created_issues = apply_issue_filters(
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                created_by_id=user_id,
            ),
            filters,
            query_params=request.query_params,
        ).count()

        assigned_issues_count = apply_issue_filters(
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            ),
            filters,
            query_params=request.query_params,
        ).count()

        pending_issues_count = apply_issue_filters(
            Issue.issue_objects.filter(
                ~Q(state__group__in=["completed", "cancelled"]),
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            ),
            filters,
            query_params=request.query_params,
        ).count()

        completed_issues_count = apply_issue_filters(
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                state__group="completed",
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            ),
            filters,
            query_params=request.query_params,
        ).count()

        subscribed_issues_count = (
            IssueSubscriber.objects.filter(
                workspace__slug=slug,
                subscriber_id=user_id,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .filter(**subscriber_filters)
            .count()
        )

        upcoming_cycles = CycleIssue.objects.filter(
            workspace__slug=slug,
            cycle__start_date__gt=timezone.now(),
            issue__assignees__in=[user_id],
        ).values("cycle__name", "cycle__id", "cycle__project_id")

        present_cycle = CycleIssue.objects.filter(
            workspace__slug=slug,
            cycle__start_date__lt=timezone.now(),
            cycle__end_date__gt=timezone.now(),
            issue__assignees__in=[user_id],
        ).values("cycle__name", "cycle__id", "cycle__project_id")

        return Response(
            {
                "state_distribution": state_distribution,
                "priority_distribution": priority_distribution,
                "created_issues": created_issues,
                "assigned_issues": assigned_issues_count,
                "completed_issues": completed_issues_count,
                "pending_issues": pending_issues_count,
                "subscribed_issues": subscribed_issues_count,
                "present_cycles": present_cycle,
                "upcoming_cycles": upcoming_cycles,
            }
        )


class UserActivityGraphEndpoint(BaseAPIView):
    def get(self, request, slug):
        issue_activities = (
            IssueActivity.objects.filter(
                actor=request.user,
                workspace__slug=slug,
                created_at__date__gte=date.today() + relativedelta(months=-6),
            )
            .annotate(created_date=Cast("created_at", DateField()))
            .values("created_date")
            .annotate(activity_count=Count("created_date"))
            .order_by("created_date")
        )

        return Response(issue_activities, status=status.HTTP_200_OK)


class UserIssueCompletedGraphEndpoint(BaseAPIView):
    def get(self, request, slug):
        month = request.GET.get("month", 1)

        issues = (
            Issue.issue_objects.filter(
                assignees__in=[request.user],
                workspace__slug=slug,
                completed_at__month=month,
                completed_at__isnull=False,
            )
            .annotate(completed_week=ExtractWeek("completed_at"))
            .annotate(week=F("completed_week") % 4)
            .values("week")
            .annotate(completed_count=Count("completed_week"))
            .order_by("week")
        )

        return Response(issues, status=status.HTTP_200_OK)
