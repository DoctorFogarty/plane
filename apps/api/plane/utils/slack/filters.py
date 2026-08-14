# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
from uuid import UUID

DEFAULT_CHANNEL_EVENTS = ["create", "state", "assignee", "comment"]
DEFAULT_DM_EVENTS = ["create", "state", "assignee", "comment", "mention"]
CHANNEL_EVENTS = {
    "create",
    "comment",
    "mention",
    "state",
    "assignee",
    "priority",
    "labels",
    "name",
    "start_date",
    "target_date",
    "type",
    "custom_property",
}
SKIP_ACTIVITY_FIELDS = {
    "description",
    "cycles",
    "modules",
    "reaction",
    "vote",
    "draft",
    "intake",
}
FIELD_TO_EVENT = {
    "assignees": "assignee",
    "state": "state",
    "priority": "priority",
    "labels": "labels",
    "name": "name",
    "start_date": "start_date",
    "target_date": "target_date",
    "type": "type",
    "comment": "comment",
    "mention": "mention",
}
REQUESTED_TO_EVENT = (
    (("state", "state_id"), "state"),
    (("assignee_ids", "assignees"), "assignee"),
    (("priority",), "priority"),
    (("label_ids", "labels"), "labels"),
    (("name",), "name"),
    (("start_date",), "start_date"),
    (("target_date",), "target_date"),
    (("type", "type_id"), "type"),
)
KNOWN_EVENT_FIELDS = set(FIELD_TO_EVENT) | set(FIELD_TO_EVENT.values()) | CHANNEL_EVENTS


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set, frozenset)):
        return list(value)
    return [value]


def _as_str_set(value) -> set[str]:
    return {str(v) for v in _as_list(value) if v is not None and str(v).strip() != ""}


def _as_event_set(event_type) -> set[str]:
    if isinstance(event_type, str):
        return {event_type} if event_type else set()
    return {str(e) for e in _as_list(event_type) if e}


def _activity_attr(activity, key, default=None):
    if isinstance(activity, dict):
        return activity.get(key, default)
    return getattr(activity, key, default)


def _looks_like_uuid(value) -> bool:
    if value is None:
        return False
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def activity_event_keys(activities, activity_type: str | None = None) -> tuple[set[str], set[str]]:
    """Map activity rows to canonical Slack event keys and custom property ids."""
    if activity_type == "issue.activity.created":
        return {"create"}, set()
    if activity_type == "comment.activity.created":
        return {"comment"}, set()

    event_keys: set[str] = set()
    custom_ids: set[str] = set()
    is_custom_type = activity_type == "issue_property.activity.updated"

    for activity in activities or []:
        field = _activity_attr(activity, "field")
        ident = _activity_attr(activity, "new_identifier")
        if field in SKIP_ACTIVITY_FIELDS:
            continue
        if is_custom_type or (
            ident
            and field
            and field not in KNOWN_EVENT_FIELDS
            and not str(field).startswith("estimate_")
        ):
            if ident:
                custom_ids.add(str(ident))
                event_keys.add("custom_property")
            continue
        mapped = FIELD_TO_EVENT.get(field)
        if mapped:
            event_keys.add(mapped)

    if is_custom_type and not event_keys:
        event_keys.add("custom_property")

    return event_keys, custom_ids


def event_keys_from_requested(requested) -> set[str]:
    data = requested
    if isinstance(requested, str):
        try:
            data = json.loads(requested)
        except (TypeError, ValueError):
            return set()
    if not isinstance(data, dict):
        return set()
    keys: set[str] = set()
    for fields, event in REQUESTED_TO_EVENT:
        if any(field in data for field in fields):
            keys.add(event)
    return keys


def events_allowed(
    selected,
    event_keys,
    custom_property_ids=None,
    selected_custom_ids=None,
    allow_all_custom: bool = False,
) -> bool:
    selected_set = {str(e) for e in (selected or [])}
    occurred = _as_event_set(event_keys)
    if not occurred:
        return False

    if (occurred - {"custom_property"}) & selected_set:
        return True

    if "custom_property" not in occurred:
        return False
    if allow_all_custom:
        return True
    selected_custom = {str(i) for i in _as_list(selected_custom_ids) if i}
    occurred_custom = {str(i) for i in _as_list(custom_property_ids) if i}
    return bool(selected_custom & occurred_custom)


def _issue_label_ids(issue) -> set[str]:
    labels = getattr(issue, "labels", None)
    if labels is None:
        return set()
    values_list = getattr(labels, "values_list", None)
    if not callable(values_list):
        return set()
    try:
        return {str(lid) for lid in values_list("id", flat=True)}
    except TypeError:
        return set()


def _custom_value_matches(actual, expected_list) -> bool:
    expected = {str(v) for v in expected_list if v is not None and str(v).strip() != ""}
    if not expected:
        return True
    if actual is None:
        return False
    if isinstance(actual, bool):
        truthy = {e.lower() for e in expected}
        return (actual and ("true" in truthy or "1" in truthy or "yes" in truthy)) or (
            not actual and ("false" in truthy or "0" in truthy or "no" in truthy)
        )
    actual_values = {str(v) for v in actual} if isinstance(actual, list) else {str(actual)}
    return bool(actual_values & expected)


def subscription_matches_issue(issue, filter_payload: dict | None) -> bool:
    payload = filter_payload or {}
    if not payload:
        return True

    priorities = payload.get("priority") or payload.get("priorities")
    if priorities:
        values = _as_list(priorities)
        if issue.priority not in values:
            return False

    states = payload.get("state") or payload.get("state_id")
    if states:
        values = {str(v) for v in _as_list(states)}
        if str(issue.state_id) not in values:
            return False

    types = payload.get("type") or payload.get("issue_type") or payload.get("work_item_type")
    if types:
        values = {str(v) for v in _as_list(types)}
        issue_type_id = getattr(issue, "type_id", None)
        if str(issue_type_id) not in values:
            return False

    labels = payload.get("labels") or payload.get("label_id")
    if labels:
        wanted = {str(v) for v in _as_list(labels)}
        if not (_issue_label_ids(issue) & wanted):
            return False

    custom_properties = payload.get("custom_properties") or {}
    if custom_properties:
        issue_id = getattr(issue, "pk", None) or getattr(issue, "id", None)
        if not _looks_like_uuid(issue_id):
            return False
        from plane.utils.issue_property import get_issue_property_values_map

        values_map = get_issue_property_values_map(issue_id)
        for property_id, expected in custom_properties.items():
            if not _custom_value_matches(values_map.get(str(property_id)), _as_list(expected)):
                return False

    return True
