# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.db.models import Project, ProjectIssueType


def get_project(slug, project_id):
    return Project.objects.get(pk=project_id, workspace__slug=slug)


def types_enabled_or_error(project):
    if not project.is_issue_type_enabled:
        return Response(
            {"error": "Work item types are not enabled for this project"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def get_default_issue_type_id(project_id):
    pit = ProjectIssueType.objects.filter(project_id=project_id, is_default=True).first()
    return pit.issue_type_id if pit else None


def ensure_issue_has_type(issue, project):
    """Assign the project default type when types are enabled and the issue has none."""
    if not project.is_issue_type_enabled or issue.type_id:
        return issue
    default_type_id = get_default_issue_type_id(project.id)
    if not default_type_id:
        return issue
    issue.type_id = default_type_id
    issue.save(update_fields=["type_id", "updated_at"])
    return issue
