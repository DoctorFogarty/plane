# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Issue, IssueType, Project, ProjectMember, State, Workspace, WorkspaceMember
from plane.utils.issue_filters import (
    EXCLUDE_EPIC_TYPES,
    SUB_ISSUE_ROOT_OR_EPIC_CHILD,
    apply_issue_filters,
    issue_filters,
    legacy_filter_kwargs,
)


@pytest.mark.unit
class TestSubIssueFilterHelpers:
    def test_sub_issue_false_is_not_written_as_kwargs(self):
        filters = issue_filters({"sub_issue": "false"}, "GET")
        assert SUB_ISSUE_ROOT_OR_EPIC_CHILD not in filters
        assert "parent__isnull" not in filters

    def test_sub_issue_true_does_not_set_field_lookups(self):
        filters = issue_filters({"sub_issue": "true"}, "GET")
        assert SUB_ISSUE_ROOT_OR_EPIC_CHILD not in filters
        assert "parent__isnull" not in filters

    def test_legacy_filter_kwargs_strips_old_markers(self):
        filters = issue_filters({"priority": "urgent,high"}, "GET")
        filters[SUB_ISSUE_ROOT_OR_EPIC_CHILD] = ""
        kwargs = legacy_filter_kwargs(filters)
        assert SUB_ISSUE_ROOT_OR_EPIC_CHILD not in kwargs
        assert kwargs["priority__in"] == ["urgent", "high"]

    def test_exclude_epics_is_not_written_as_kwargs(self):
        filters = issue_filters({"exclude_epics": "true"}, "GET")
        assert EXCLUDE_EPIC_TYPES not in filters

    def test_exclude_epics_false_does_not_set_field_lookups(self):
        filters = issue_filters({"exclude_epics": "false"}, "GET")
        assert EXCLUDE_EPIC_TYPES not in filters

    def test_legacy_filter_kwargs_strips_exclude_epics_marker(self):
        filters = issue_filters({"priority": "urgent"}, "GET")
        filters[EXCLUDE_EPIC_TYPES] = ""
        kwargs = legacy_filter_kwargs(filters)
        assert EXCLUDE_EPIC_TYPES not in kwargs
        assert kwargs["priority__in"] == ["urgent"]

    def test_updated_at_uses_updated_at_field(self):
        filters = issue_filters({"updated_at": "2024-01-01;after"}, "GET")
        assert "updated_at__date__gte" in filters
        assert "created_at__date__gte" not in filters

    def test_intake_status_post_reads_intake_status(self):
        filters = issue_filters({"intake_status": [1, 2]}, "POST")
        assert filters["issue_intake__status__in"] == [1, 2]


@pytest.fixture
def epic_child_filter_context(db, create_user):
    workspace = Workspace.objects.create(name="Epic Filter WS", slug="epic-filter-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Epic Filter Project",
        identifier="EFP",
        workspace=workspace,
        created_by=create_user,
        is_issue_type_enabled=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(
        name="Todo",
        project=project,
        workspace=workspace,
        group="backlog",
        default=True,
    )
    task_type = IssueType.objects.create(
        workspace=workspace,
        name="Task",
        is_epic=False,
        is_default=True,
    )
    epic_type = IssueType.objects.create(
        workspace=workspace,
        name="Epic",
        is_epic=True,
        is_default=False,
    )

    root_task = Issue.objects.create(
        name="Root task",
        project=project,
        workspace=workspace,
        state=state,
        type=task_type,
        created_by=create_user,
    )
    epic = Issue.objects.create(
        name="Parent epic",
        project=project,
        workspace=workspace,
        state=state,
        type=epic_type,
        created_by=create_user,
    )
    epic_child = Issue.objects.create(
        name="Task under epic",
        project=project,
        workspace=workspace,
        state=state,
        type=task_type,
        parent=epic,
        created_by=create_user,
    )
    nested_task = Issue.objects.create(
        name="Task under task",
        project=project,
        workspace=workspace,
        state=state,
        type=task_type,
        parent=root_task,
        created_by=create_user,
    )
    untyped = Issue.objects.create(
        name="Untyped root",
        project=project,
        workspace=workspace,
        state=state,
        type=None,
        created_by=create_user,
    )

    return {
        "project": project,
        "task_type": task_type,
        "epic_type": epic_type,
        "root_task": root_task,
        "epic": epic,
        "epic_child": epic_child,
        "nested_task": nested_task,
        "untyped": untyped,
    }


@pytest.mark.unit
@pytest.mark.django_db
class TestApplyIssueFiltersSubIssue:
    def test_sub_issue_false_keeps_roots_and_epic_children(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"]),
            {},
            query_params={"sub_issue": "false"},
        )
        ids = set(qs.values_list("id", flat=True))

        assert ctx["root_task"].id in ids
        assert ctx["epic"].id in ids
        assert ctx["epic_child"].id in ids
        assert ctx["nested_task"].id not in ids
        assert ctx["untyped"].id in ids

    def test_exclude_epics_with_sub_issue_false_keeps_tasks_and_epic_children(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"]),
            {},
            query_params={"sub_issue": "false", "exclude_epics": "true"},
        )
        ids = set(qs.values_list("id", flat=True))

        assert ctx["root_task"].id in ids
        assert ctx["epic_child"].id in ids
        assert ctx["untyped"].id in ids
        assert ctx["epic"].id not in ids
        assert ctx["nested_task"].id not in ids

    def test_exclude_epics_with_sub_issue_true_hides_epics_keeps_nested_tasks(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"]),
            {},
            query_params={"sub_issue": "true", "exclude_epics": "true"},
        )
        ids = set(qs.values_list("id", flat=True))

        assert ctx["root_task"].id in ids
        assert ctx["epic_child"].id in ids
        assert ctx["nested_task"].id in ids
        assert ctx["untyped"].id in ids
        assert ctx["epic"].id not in ids

    def test_type_filter_task_with_sub_issue_false_returns_epic_child_tasks(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"], type_id=ctx["task_type"].id),
            {},
            query_params={"sub_issue": "false"},
        )
        ids = set(qs.values_list("id", flat=True))

        assert ctx["root_task"].id in ids
        assert ctx["epic_child"].id in ids
        assert ctx["epic"].id not in ids
        assert ctx["nested_task"].id not in ids

    def test_sub_issue_true_includes_all_parented_issues(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"]),
            {},
            query_params={"sub_issue": "true"},
        )
        ids = set(qs.values_list("id", flat=True))

        assert ctx["root_task"].id in ids
        assert ctx["epic"].id in ids
        assert ctx["epic_child"].id in ids
        assert ctx["nested_task"].id in ids

    def test_legacy_marker_blobs_still_apply(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        qs = apply_issue_filters(
            Issue.issue_objects.filter(project=ctx["project"]),
            {SUB_ISSUE_ROOT_OR_EPIC_CHILD: "", EXCLUDE_EPIC_TYPES: ""},
        )
        ids = set(qs.values_list("id", flat=True))
        assert ctx["epic"].id not in ids
        assert ctx["nested_task"].id not in ids
        assert ctx["epic_child"].id in ids

    def test_show_sub_issues_false_matches_sub_issue_false(self, epic_child_filter_context):
        ctx = epic_child_filter_context
        hidden = set(
            apply_issue_filters(
                Issue.issue_objects.filter(project=ctx["project"]),
                {},
                query_params={"show_sub_issues": "false"},
            ).values_list("id", flat=True)
        )
        explicit = set(
            apply_issue_filters(
                Issue.issue_objects.filter(project=ctx["project"]),
                {},
                query_params={"sub_issue": "false"},
            ).values_list("id", flat=True)
        )
        assert hidden == explicit
        assert ctx["nested_task"].id not in hidden
        assert ctx["epic_child"].id in hidden
