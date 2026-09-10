# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue
from plane.utils.host import base_host
from plane.utils.issue_property import (
    get_issue_property_values_map,
    get_issues_property_values_maps,
    upsert_property_values,
)
from plane.utils.issue_property_activity import record_property_value_activities

from .type_common import ensure_issue_has_type, get_project
from ..base import BaseAPIView


class IssuePropertyValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(get_issue_property_values_map(issue_id, project_id), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        return self._upsert(request, slug, project_id, issue_id)

    def _upsert(self, request, slug, project_id, issue_id):
        project = get_project(slug, project_id)
        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        if not project.is_issue_type_enabled:
            return Response({}, status=status.HTTP_200_OK)

        issue = ensure_issue_has_type(issue, project)
        if not issue.type_id:
            return Response({}, status=status.HTTP_200_OK)

        if "property_values" in request.data:
            property_values = request.data.get("property_values") or {}
        else:
            property_values = {key: value for key, value in request.data.items() if key != "validate_required"}
        validate_required = request.data.get("validate_required", True)

        if not isinstance(property_values, dict):
            return Response({"error": "property_values must be an object"}, status=status.HTTP_400_BAD_REQUEST)

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

        record_property_value_activities(
            issue_id=issue_id,
            project_id=project_id,
            workspace_id=project.workspace_id,
            actor=request.user,
            old_values=old_values,
            new_values=result,
            origin=base_host(request=request, is_app=True),
        )
        return Response(result, status=status.HTTP_200_OK)


class IssuePropertyValueBulkEndpoint(BaseAPIView):
    """Bulk-fetch property values for many work items in a project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = get_project(slug, project_id)
        if not project.is_issue_type_enabled:
            return Response({}, status=status.HTTP_200_OK)

        issue_ids = request.data.get("issue_ids") or []
        if not isinstance(issue_ids, list):
            return Response({"error": "issue_ids must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        issue_ids = [str(i) for i in issue_ids[:500]]
        if not issue_ids:
            return Response({}, status=status.HTTP_200_OK)

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
