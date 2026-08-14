# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch
from uuid import uuid4

import pytest

from plane.db.models import (
    Issue,
    IssueAssignee,
    Label,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.utils.automation.actions import execute_add_comment, execute_change_property


@pytest.fixture
def action_context(db, create_user):
    workspace = Workspace.objects.create(name="Action WS", slug="action-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Project",
        identifier="ACT",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    issue = Issue.objects.create(
        name="Test issue",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
        priority="none",
    )
    return {
        "workspace": workspace,
        "project": project,
        "issue": issue,
        "user": create_user,
        "state": state,
    }


@pytest.mark.unit
@pytest.mark.django_db
def test_invalid_assignee_rejected(action_context):
    issue = action_context["issue"]
    user = action_context["user"]
    with pytest.raises(ValueError, match="Invalid project member"):
        execute_change_property(
            issue,
            {"property": "assignees", "change_type": "set", "value": [str(uuid4())]},
            user,
        )


@pytest.mark.unit
@pytest.mark.django_db
def test_soft_deleted_assignee_can_be_restored(action_context):
    issue = action_context["issue"]
    user = action_context["user"]
    project = action_context["project"]

    link = IssueAssignee.objects.create(
        issue=issue,
        assignee=user,
        project=project,
        workspace=project.workspace,
    )
    link.delete()
    assert IssueAssignee.objects.filter(issue=issue, assignee=user).count() == 0

    with patch("plane.utils.automation.actions.issue_activity.delay"):
        execute_change_property(
            issue,
            {"property": "assignees", "change_type": "add", "value": [str(user.id)]},
            user,
        )

    restored = IssueAssignee.all_objects.get(issue=issue, assignee=user)
    assert restored.deleted_at is None


@pytest.mark.unit
@pytest.mark.django_db
def test_add_assignee_does_not_revive_stale_members(action_context, create_user):
    issue = action_context["issue"]
    stale = action_context["user"]
    project = action_context["project"]
    added = User.objects.create(email="fresh-assignee@plane.so", username="fresh-assignee")
    WorkspaceMember.objects.create(workspace=project.workspace, member=added, role=20)
    ProjectMember.objects.create(project=project, member=added, role=20)

    link = IssueAssignee.objects.create(
        issue=issue,
        assignee=stale,
        project=project,
        workspace=project.workspace,
    )
    link.delete()

    with patch("plane.utils.automation.actions.issue_activity.delay"):
        result = execute_change_property(
            issue,
            {"property": "assignees", "change_type": "add", "value": [str(added.id)]},
            stale,
        )

    assert result["requested"]["assignee_ids"] == [str(added.id)]
    assert IssueAssignee.objects.filter(issue=issue).count() == 1
    assert IssueAssignee.objects.filter(issue=issue, assignee=added).exists()
    assert not IssueAssignee.objects.filter(issue=issue, assignee=stale).exists()


@pytest.mark.unit
@pytest.mark.django_db
def test_invalid_label_rejected(action_context):
    issue = action_context["issue"]
    user = action_context["user"]
    with pytest.raises(ValueError, match="Invalid label"):
        execute_change_property(
            issue,
            {"property": "labels", "change_type": "set", "value": [str(uuid4())]},
            user,
        )


@pytest.mark.unit
@pytest.mark.django_db
def test_comment_html_is_sanitized(action_context):
    issue = action_context["issue"]
    user = action_context["user"]

    with patch("plane.utils.automation.actions.issue_activity.delay"):
        result = execute_add_comment(
            issue,
            {"comment_html": '<p>Hello<script>alert(1)</script></p>'},
            user,
        )

    assert "script" not in result["comment_stripped"].lower()
    assert "Hello" in result["comment_stripped"]


@pytest.mark.unit
@pytest.mark.django_db
def test_valid_label_assignment(action_context):
    issue = action_context["issue"]
    user = action_context["user"]
    project = action_context["project"]
    label = Label.objects.create(name="Bug", project=project, workspace=project.workspace)

    with patch("plane.utils.automation.actions.issue_activity.delay"):
        execute_change_property(
            issue,
            {"property": "labels", "change_type": "set", "value": [str(label.id)]},
            user,
        )

    assert list(issue.labels.values_list("id", flat=True)) == [label.id]
