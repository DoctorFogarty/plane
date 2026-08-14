# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.db.models import (
    Automation,
    AutomationAction,
    AutomationRun,
    Issue,
    Project,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.utils.automation.runner import evaluate_automations_for_event, map_activity_to_triggers


@pytest.fixture
def automation_context(db, create_user):
    workspace = Workspace.objects.create(name="Auto WS", slug="auto-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Project",
        identifier="AUTO",
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
def test_skip_if_automation_flag_short_circuits():
    results = evaluate_automations_for_event(
        project_id="p1",
        issue_id="i1",
        trigger_types=["work_item.updated"],
        skip_if_automation=True,
    )
    assert results == []


@pytest.mark.unit
@pytest.mark.django_db
def test_evaluate_runs_action_and_logs(automation_context):
    project = automation_context["project"]
    issue = automation_context["issue"]
    user = automation_context["user"]

    automation = Automation.objects.create(
        project=project,
        workspace=project.workspace,
        name="Set priority",
        is_enabled=True,
        trigger_type="work_item.state_changed",
        created_by=user,
    )
    AutomationAction.objects.create(
        automation=automation,
        project=project,
        workspace=project.workspace,
        action_type="change_property",
        config={"property": "priority", "change_type": "set", "value": "urgent"},
        order=0,
    )

    with patch("plane.utils.automation.actions.issue_activity.delay") as activity_delay:
        runs = evaluate_automations_for_event(
            project_id=project.id,
            issue_id=issue.id,
            trigger_types=["work_item.state_changed"],
            event_key=f"test-event-{automation.id}",
        )

    assert len(runs) == 1
    run = runs[0]
    assert run.status == AutomationRun.Status.SUCCESS
    issue.refresh_from_db()
    assert issue.priority == "urgent"
    assert activity_delay.called
    payload = activity_delay.call_args.kwargs["requested_data"]
    assert "automation" in payload


@pytest.mark.unit
@pytest.mark.django_db
def test_idempotency_prevents_double_run(automation_context):
    project = automation_context["project"]
    issue = automation_context["issue"]
    user = automation_context["user"]

    automation = Automation.objects.create(
        project=project,
        workspace=project.workspace,
        name="Comment once",
        is_enabled=True,
        trigger_type="work_item.created",
        created_by=user,
    )
    AutomationAction.objects.create(
        automation=automation,
        project=project,
        workspace=project.workspace,
        action_type="add_comment",
        config={"comment_html": "<p>Hello</p>"},
        order=0,
    )

    event_key = f"delivery-1:{issue.id}"
    with patch("plane.utils.automation.actions.issue_activity.delay"):
        first = evaluate_automations_for_event(
            project_id=project.id,
            issue_id=issue.id,
            trigger_types=["work_item.created"],
            event_key=event_key,
        )
        second = evaluate_automations_for_event(
            project_id=project.id,
            issue_id=issue.id,
            trigger_types=["work_item.created"],
            event_key=event_key,
        )

    assert len(first) == 1
    assert second == []
    assert AutomationRun.objects.filter(automation=automation).count() == 1


@pytest.mark.unit
def test_github_pr_trigger_mapping():
    from plane.bgtasks.github_webhook_task import _github_pr_trigger

    assert _github_pr_trigger("opened", {}) == "github.pr_opened"
    assert _github_pr_trigger("ready_for_review", {}) == "github.pr_ready_for_review"
    assert _github_pr_trigger("closed", {"merged": True}) == "github.pr_merged"
    assert _github_pr_trigger("closed", {"merged": False}) == "github.pr_closed"
    assert _github_pr_trigger("edited", {}) is None


@pytest.mark.unit
def test_map_activity_triggers_require_actual_change():
    assert map_activity_to_triggers(
        "issue.activity.updated",
        {"state_id": "s1"},
        {"state_id": "s1"},
    ) == ["work_item.updated"]

    assert map_activity_to_triggers(
        "issue.activity.updated",
        {"state_id": "s2"},
        {"state_id": "s1"},
    ) == ["work_item.updated", "work_item.state_changed"]

    assert map_activity_to_triggers(
        "issue.activity.updated",
        {"assignee_ids": ["a1", "a2"]},
        {"assignee_ids": ["a2", "a1"]},
    ) == ["work_item.updated"]

    assert map_activity_to_triggers(
        "issue.activity.updated",
        {"assignee_ids": ["a1"]},
        {"assignee_ids": []},
    ) == ["work_item.updated", "work_item.assignee_changed"]


@pytest.mark.unit
@pytest.mark.django_db
def test_empty_event_key_allows_repeat_runs(automation_context):
    """Plane path must not one-shot automations via a stable per-issue fallback key."""
    project = automation_context["project"]
    issue = automation_context["issue"]
    user = automation_context["user"]

    automation = Automation.objects.create(
        project=project,
        workspace=project.workspace,
        name="Repeatable",
        is_enabled=True,
        trigger_type="work_item.state_changed",
        created_by=user,
    )
    AutomationAction.objects.create(
        automation=automation,
        project=project,
        workspace=project.workspace,
        action_type="change_property",
        config={"property": "priority", "change_type": "set", "value": "high"},
        order=0,
    )

    with patch("plane.utils.automation.actions.issue_activity.delay"):
        first = evaluate_automations_for_event(
            project_id=project.id,
            issue_id=issue.id,
            trigger_types=["work_item.state_changed"],
            event_key="",
        )
        second = evaluate_automations_for_event(
            project_id=project.id,
            issue_id=issue.id,
            trigger_types=["work_item.state_changed"],
            event_key="",
        )

    assert len(first) == 1
    assert len(second) == 1
    assert AutomationRun.objects.filter(automation=automation).count() == 2
