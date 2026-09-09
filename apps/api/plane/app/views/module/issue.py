# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django Imports
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third party imports
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import ModuleIssueSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    ModuleIssue,
    Project,
)
from plane.utils.filters import IssueComplexFilterBackend
from plane.utils.filters import IssueFilterSet
from plane.utils.issue_query import INTAKE_BOARD_COUNT_FILTER, list_issue_board
from .. import BaseViewSet
from plane.utils.host import base_host


class ModuleIssueViewSet(BaseViewSet):
    serializer_class = ModuleIssueSerializer
    model = ModuleIssue
    webhook_event = "module_issue"
    bulk = True
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get_queryset(self):
        return (
            Issue.issue_objects.filter(
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                issue_module__module_id=self.kwargs.get("module_id"),
                issue_module__deleted_at__isnull=True,
            )
        ).distinct()

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id, module_id):
        return list_issue_board(
            self,
            request,
            slug=slug,
            project_id=project_id,
            queryset=self.get_queryset(),
            prefetch=("assignees", "labels", "issue_module__module"),
            count_filter=INTAKE_BOARD_COUNT_FILTER,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    # create multiple issues inside a module
    def create_module_issues(self, request, slug, project_id, module_id):
        issues = request.data.get("issues", [])
        if not issues:
            return Response({"error": "Issues are required"}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects.get(pk=project_id)
        # Scope to workspace+project to prevent cross-tenant IDOR
        issues = list(
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                pk__in=issues,
            ).values_list("id", flat=True)
        )
        _ = ModuleIssue.objects.bulk_create(
            [
                ModuleIssue(
                    issue_id=str(issue),
                    module_id=module_id,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for issue in issues
            ],
            batch_size=10,
            ignore_conflicts=True,
        )
        # Bulk Update the activity
        _ = [
            issue_activity.delay(
                type="module.activity.created",
                requested_data=json.dumps({"module_id": str(module_id)}),
                actor_id=str(request.user.id),
                issue_id=str(issue),
                project_id=project_id,
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            for issue in issues
        ]
        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    # add multiple module inside an issue and remove multiple modules from an issue
    def create_issue_modules(self, request, slug, project_id, issue_id):
        modules = request.data.get("modules", [])
        removed_modules = request.data.get("removed_modules", [])
        project = Project.objects.get(pk=project_id)

        if modules:
            _ = ModuleIssue.objects.bulk_create(
                [
                    ModuleIssue(
                        issue_id=issue_id,
                        module_id=module,
                        project_id=project_id,
                        workspace_id=project.workspace_id,
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    for module in modules
                ],
                batch_size=10,
                ignore_conflicts=True,
            )
            # Bulk Update the activity
            _ = [
                issue_activity.delay(
                    type="module.activity.created",
                    requested_data=json.dumps({"module_id": module}),
                    actor_id=str(request.user.id),
                    issue_id=issue_id,
                    project_id=project_id,
                    current_instance=None,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
                for module in modules
            ]

        for module_id in removed_modules:
            module_issue = ModuleIssue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                module_id=module_id,
                issue_id=issue_id,
            )
            issue_activity.delay(
                type="module.activity.deleted",
                requested_data=json.dumps({"module_id": str(module_id)}),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=json.dumps(
                    {
                        "module_name": (
                            module_issue.first().module.name
                            if (module_issue.first() and module_issue.first().module)
                            else None
                        )
                    }
                ),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            module_issue.delete()

        return Response({"message": "success"}, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, module_id, issue_id):
        module_issue = ModuleIssue.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            module_id=module_id,
            issue_id=issue_id,
        )
        issue_activity.delay(
            type="module.activity.deleted",
            requested_data=json.dumps({"module_id": str(module_id)}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps({"module_name": module_issue.first().module.name}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        module_issue.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
