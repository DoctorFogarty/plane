# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Sub-issues GET must include type_id / is_epic so expanded rows can show
work-item type badges immediately (same shape as the main issue list)."""

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.issue.sub_issue import SubIssuesEndpoint
from plane.db.models import Issue, IssueType, Project, ProjectMember, State, Workspace, WorkspaceMember


@pytest.fixture
def sub_issues_context(db, create_user):
    workspace = Workspace.objects.create(name="WS", slug="sub-issues-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Project",
        identifier="PROJ",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(name="Todo", project=project, workspace=workspace, group="backlog", default=True)

    epic_type = IssueType.objects.create(
        workspace=workspace,
        name="Epic",
        is_epic=True,
        is_default=False,
    )
    task_type = IssueType.objects.create(
        workspace=workspace,
        name="Task",
        is_epic=False,
        is_default=True,
    )

    parent = Issue.objects.create(
        name="Parent Epic",
        project=project,
        workspace=workspace,
        state=state,
        type=epic_type,
        created_by=create_user,
    )
    child = Issue.objects.create(
        name="Child Task",
        project=project,
        workspace=workspace,
        state=state,
        type=task_type,
        parent=parent,
        created_by=create_user,
    )

    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "parent": parent,
        "child": child,
        "epic_type": epic_type,
        "task_type": task_type,
    }


@pytest.mark.unit
@pytest.mark.django_db
def test_sub_issues_payload_includes_type_id_and_is_epic(sub_issues_context):
    ctx = sub_issues_context
    factory = APIRequestFactory()
    request = factory.get(
        f"/api/workspaces/{ctx['workspace'].slug}/projects/{ctx['project'].id}/issues/{ctx['parent'].id}/sub-issues/"
    )
    force_authenticate(request, user=ctx["user"])

    response = SubIssuesEndpoint.as_view()(
        request,
        slug=ctx["workspace"].slug,
        project_id=ctx["project"].id,
        issue_id=ctx["parent"].id,
    )

    assert response.status_code == status.HTTP_200_OK, response.data
    sub_issues = response.data["sub_issues"]
    assert len(sub_issues) == 1

    child_payload = sub_issues[0]
    assert "type_id" in child_payload
    assert "is_epic" in child_payload
    assert str(child_payload["type_id"]) == str(ctx["task_type"].id)
    assert child_payload["is_epic"] is False


@pytest.mark.unit
@pytest.mark.django_db
def test_sub_issues_payload_marks_epic_children(sub_issues_context):
    ctx = sub_issues_context
    epic_child = Issue.objects.create(
        name="Nested Epic",
        project=ctx["project"],
        workspace=ctx["workspace"],
        state=State.objects.get(project=ctx["project"], default=True),
        type=ctx["epic_type"],
        parent=ctx["parent"],
        created_by=ctx["user"],
    )

    factory = APIRequestFactory()
    request = factory.get(
        f"/api/workspaces/{ctx['workspace'].slug}/projects/{ctx['project'].id}/issues/{ctx['parent'].id}/sub-issues/"
    )
    force_authenticate(request, user=ctx["user"])

    response = SubIssuesEndpoint.as_view()(
        request,
        slug=ctx["workspace"].slug,
        project_id=ctx["project"].id,
        issue_id=ctx["parent"].id,
    )

    assert response.status_code == status.HTTP_200_OK, response.data
    by_id = {str(item["id"]): item for item in response.data["sub_issues"]}
    assert str(epic_child.id) in by_id
    assert by_id[str(epic_child.id)]["is_epic"] is True
    assert str(by_id[str(epic_child.id)]["type_id"]) == str(ctx["epic_type"].id)
