# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest

from plane.utils.automation.conditions import evaluate_conditions
from plane.utils.automation.runner import map_activity_to_triggers


class FakeQuerySet(list):
    def values_list(self, field, flat=False):
        return [getattr(item, field) for item in self]


def make_issue(**kwargs):
    assignees = FakeQuerySet(kwargs.pop("assignees", []))
    labels = FakeQuerySet(kwargs.pop("labels", []))
    defaults = {
        "state_id": None,
        "priority": "none",
        "type_id": None,
        "created_by_id": None,
        "assignees": assignees,
        "labels": labels,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def make_condition(field, operator, value, group=0):
    return SimpleNamespace(field=field, operator=operator, value=value, group=group)


@pytest.mark.unit
def test_empty_conditions_match():
    assert evaluate_conditions(make_issue(priority="high"), []) is True


@pytest.mark.unit
def test_and_groups_require_all_groups():
    issue = make_issue(priority="high", state_id="s1")
    conditions = [
        make_condition("priority", "is", {"value": "high"}, group=0),
        make_condition("state", "is", {"value": "s1"}, group=1),
    ]
    assert evaluate_conditions(issue, conditions) is True
    conditions[1] = make_condition("state", "is", {"value": "other"}, group=1)
    assert evaluate_conditions(issue, conditions) is False


@pytest.mark.unit
def test_or_within_group():
    issue = make_issue(priority="medium")
    conditions = [
        make_condition("priority", "is", {"value": "high"}, group=0),
        make_condition("priority", "is", {"value": "medium"}, group=0),
    ]
    assert evaluate_conditions(issue, conditions) is True


@pytest.mark.unit
def test_assignees_in_operator():
    issue = make_issue(assignees=[SimpleNamespace(id="u1"), SimpleNamespace(id="u2")])
    conditions = [make_condition("assignees", "in", {"values": ["u2", "u3"]}, group=0)]
    assert evaluate_conditions(issue, conditions) is True


@pytest.mark.unit
def test_map_activity_to_triggers_state_and_assignee():
    triggers = map_activity_to_triggers(
        "issue.activity.updated",
        {"state_id": "abc", "assignee_ids": ["u1"], "priority": "high"},
        {},
    )
    assert "work_item.updated" in triggers
    assert "work_item.state_changed" in triggers
    assert "work_item.assignee_changed" in triggers


@pytest.mark.unit
def test_map_activity_skips_unknown_types():
    assert map_activity_to_triggers("link.activity.created", {}, {}) == []


@pytest.mark.unit
def test_map_created_and_comment():
    assert map_activity_to_triggers("issue.activity.created", {}, {}) == ["work_item.created"]
    assert map_activity_to_triggers("comment.activity.created", {}, {}) == ["work_item.comment_added"]
