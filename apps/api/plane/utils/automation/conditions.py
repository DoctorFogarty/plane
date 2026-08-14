# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from collections import defaultdict

from plane.utils.issue_assignees import live_assignee_ids


def _normalize_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, dict):
        if "values" in value:
            return [str(v) for v in value.get("values") or []]
        if "value" in value:
            return [str(value["value"])]
        return [str(v) for v in value.values()]
    return [str(value)]


def _extract_compare_value(value):
    if isinstance(value, dict):
        if "value" in value:
            return value["value"]
        if "values" in value and value["values"]:
            return value["values"][0]
    return value


def _issue_field_value(issue, field: str):
    if field == "state":
        return str(issue.state_id) if issue.state_id else None
    if field == "priority":
        return issue.priority
    if field == "assignees":
        return live_assignee_ids(issue)
    if field == "labels":
        return [str(lid) for lid in issue.labels.values_list("id", flat=True)]
    if field == "work_item_type":
        return str(issue.type_id) if issue.type_id else None
    if field == "created_by":
        return str(issue.created_by_id) if issue.created_by_id else None
    return None


def _compare(operator: str, actual, expected_raw) -> bool:
    expected_list = _normalize_list(expected_raw)
    expected = _extract_compare_value(expected_raw)

    if operator == "is":
        if isinstance(actual, list):
            return set(actual) == set(expected_list) if expected_list else not actual
        return str(actual) == str(expected) if expected is not None else actual is None

    if operator == "is_not":
        if isinstance(actual, list):
            return set(actual) != set(expected_list)
        return str(actual) != str(expected) if expected is not None else actual is not None

    if operator == "in":
        if isinstance(actual, list):
            return bool(set(actual) & set(expected_list))
        return str(actual) in expected_list

    if operator == "contains":
        if isinstance(actual, list):
            return all(item in actual for item in expected_list) if expected_list else False
        return str(expected) in str(actual or "")

    # Numeric / string ordering for priority-like fields
    try:
        left = float(actual) if actual is not None else None
        right = float(expected) if expected is not None else None
    except (TypeError, ValueError):
        left = str(actual) if actual is not None else None
        right = str(expected) if expected is not None else None

    if left is None or right is None:
        return False

    if operator == "gt":
        return left > right
    if operator == "gte":
        return left >= right
    if operator == "lt":
        return left < right
    if operator == "lte":
        return left <= right

    return False


def evaluate_conditions(issue, conditions) -> bool:
    """
    Evaluate automation conditions.

    Conditions in the same `group` are OR'd; groups are AND'd together.
    An empty condition list always matches.
    """
    if not conditions:
        return True

    grouped = defaultdict(list)
    for condition in conditions:
        grouped[condition.group].append(condition)

    for group_conditions in grouped.values():
        group_match = False
        for condition in group_conditions:
            actual = _issue_field_value(issue, condition.field)
            if _compare(condition.operator, actual, condition.value):
                group_match = True
                break
        if not group_match:
            return False
    return True
