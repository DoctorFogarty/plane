# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import (
    Cycle,
    CycleIssue,
    Intake,
    IntakeIssue,
    Issue,
    IssueType,
    Module,
    ModuleIssue,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    StateGroup,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.intake import SourceType
from plane.db.models.issue_property import IssueProperty, IssuePropertyType
from plane.utils.work_item import (
    WorkItemCreateError,
    adapt_public_work_item_payload,
    create_work_item,
    ensure_triage_state,
)


@pytest.fixture
def work_item_context(db, create_user):
    workspace = Workspace.objects.create(name="Create WS", slug="create-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Create Project",
        identifier="CRP",
        workspace=workspace,
        created_by=create_user,
        is_issue_type_enabled=True,
        default_assignee=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(
        name="Todo",
        project=project,
        workspace=workspace,
        group="backlog",
        default=True,
    )
    task_type = IssueType.objects.create(workspace=workspace, name="Task", is_epic=False, is_default=True)
    ProjectIssueType.objects.create(
        project=project,
        issue_type=task_type,
        workspace=workspace,
        is_default=True,
    )
    cycle = Cycle.objects.create(name="Sprint 1", project=project, workspace=workspace, owned_by=create_user)
    module = Module.objects.create(name="Module 1", project=project, workspace=workspace)
    return {
        "user": create_user,
        "project": project,
        "state": state,
        "task_type": task_type,
        "cycle": cycle,
        "module": module,
    }


@pytest.mark.unit
@pytest.mark.django_db
class TestCreateWorkItem:
    def test_creates_issue_with_cycle_and_module(self, work_item_context):
        ctx = work_item_context
        issue = create_work_item(
            project=ctx["project"],
            actor=ctx["user"],
            data={
                "name": "Atomic create",
                "state_id": str(ctx["state"].id),
                "type_id": str(ctx["task_type"].id),
                "cycle_id": str(ctx["cycle"].id),
                "module_ids": [str(ctx["module"].id)],
            },
            validate_property_required=False,
        )
        assert issue.name == "Atomic create"
        assert CycleIssue.objects.filter(issue=issue, cycle=ctx["cycle"]).exists()
        assert ModuleIssue.objects.filter(issue=issue, module=ctx["module"]).exists()

    def test_rolls_back_issue_when_property_values_invalid(self, work_item_context):
        ctx = work_item_context
        with pytest.raises(WorkItemCreateError):
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Should not persist",
                    "state_id": str(ctx["state"].id),
                    "type_id": str(ctx["task_type"].id),
                    "property_values": {"00000000-0000-0000-0000-000000000000": "nope"},
                },
                validate_property_required=True,
            )
        assert not Issue.objects.filter(name="Should not persist").exists()

    def test_rejects_cycle_from_another_project(self, work_item_context, create_user):
        ctx = work_item_context
        other_workspace = Workspace.objects.create(name="Other WS", slug="other-create-ws", owner=create_user)
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OTH",
            workspace=other_workspace,
            created_by=create_user,
        )
        other_cycle = Cycle.objects.create(
            name="Foreign sprint",
            project=other_project,
            workspace=other_workspace,
            owned_by=create_user,
        )
        with pytest.raises(WorkItemCreateError) as exc:
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Bad cycle",
                    "state_id": str(ctx["state"].id),
                    "cycle_id": str(other_cycle.id),
                },
                validate_property_required=False,
            )
        assert "cycle_id" in str(exc.value.payload)
        assert not Issue.objects.filter(name="Bad cycle").exists()

    def test_rejects_invalid_cycle_uuid(self, work_item_context):
        ctx = work_item_context
        with pytest.raises(WorkItemCreateError) as exc:
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Bad cycle uuid",
                    "state_id": str(ctx["state"].id),
                    "cycle_id": "not-a-uuid",
                },
                validate_property_required=False,
            )
        assert "cycle_id" in str(exc.value.payload)
        assert not Issue.objects.filter(name="Bad cycle uuid").exists()

    def test_rejects_invalid_module_uuid(self, work_item_context):
        ctx = work_item_context
        with pytest.raises(WorkItemCreateError) as exc:
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Bad module uuid",
                    "state_id": str(ctx["state"].id),
                    "module_ids": ["not-a-uuid"],
                },
                validate_property_required=False,
            )
        assert "module_ids" in str(exc.value.payload)
        assert not Issue.objects.filter(name="Bad module uuid").exists()

    def test_rejects_non_list_module_ids(self, work_item_context):
        ctx = work_item_context
        with pytest.raises(WorkItemCreateError) as exc:
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Bad modules",
                    "state_id": str(ctx["state"].id),
                    "module_ids": str(ctx["module"].id),
                },
                validate_property_required=False,
            )
        assert "module_ids" in str(exc.value.payload)
        assert not Issue.objects.filter(name="Bad modules").exists()

    def test_in_transaction_failure_rolls_back_issue(self, work_item_context):
        ctx = work_item_context

        def boom(_issue):
            raise WorkItemCreateError({"error": "hook failed"})

        with pytest.raises(WorkItemCreateError):
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={"name": "Hook rollback", "state_id": str(ctx["state"].id)},
                validate_property_required=False,
                in_transaction=boom,
            )
        assert not Issue.objects.filter(name="Hook rollback").exists()

    def test_required_properties_enforced_when_types_enabled(self, work_item_context):
        ctx = work_item_context
        IssueProperty.objects.create(
            project=ctx["project"],
            workspace=ctx["project"].workspace,
            issue_type=ctx["task_type"],
            name="Severity",
            property_type=IssuePropertyType.TEXT,
            is_required=True,
            is_active=True,
        )
        with pytest.raises(WorkItemCreateError):
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={
                    "name": "Missing required",
                    "state_id": str(ctx["state"].id),
                    "type_id": str(ctx["task_type"].id),
                },
            )
        assert not Issue.objects.filter(name="Missing required").exists()

    def test_adapt_public_work_item_payload_maps_assignees_and_labels(self):
        adapted = adapt_public_work_item_payload(
            {"name": "API item", "assignees": ["a"], "labels": ["b"], "priority": "high"}
        )
        assert adapted["assignee_ids"] == ["a"]
        assert adapted["label_ids"] == ["b"]
        assert "assignees" not in adapted
        assert adapted["priority"] == "high"

    def test_ensure_triage_state_reuses_existing(self, work_item_context):
        ctx = work_item_context
        first = ensure_triage_state(ctx["project"])
        second = ensure_triage_state(ctx["project"])
        assert first.id == second.id
        assert first.group == StateGroup.TRIAGE.value

    def test_create_work_item_allows_triage_state(self, work_item_context):
        ctx = work_item_context
        triage = ensure_triage_state(ctx["project"])
        issue = create_work_item(
            project=ctx["project"],
            actor=ctx["user"],
            data={"name": "Triage item", "state_id": str(triage.id)},
            allow_triage_state=True,
            validate_property_required=False,
        )
        assert issue.state_id == triage.id

    def test_intake_attach_failure_rolls_back_issue_and_intake(self, work_item_context):
        ctx = work_item_context
        intake = Intake.objects.create(name="Inbox", project=ctx["project"], workspace=ctx["project"].workspace)

        def attach_then_fail(created_issue):
            IntakeIssue.objects.create(
                intake_id=intake.id,
                project_id=ctx["project"].id,
                issue=created_issue,
                source=SourceType.IN_APP,
            )
            raise WorkItemCreateError({"error": "hook failed"})

        with pytest.raises(WorkItemCreateError):
            create_work_item(
                project=ctx["project"],
                actor=ctx["user"],
                data={"name": "Intake rollback", "state_id": str(ctx["state"].id)},
                validate_property_required=False,
                in_transaction=attach_then_fail,
            )
        assert not Issue.objects.filter(name="Intake rollback").exists()
        assert not IntakeIssue.objects.filter(intake=intake).exists()
