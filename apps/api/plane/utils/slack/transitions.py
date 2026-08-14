# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
from dataclasses import dataclass

from django.utils.html import strip_tags

from plane.db.models import Label, SlackUserConnection, User

NONE = "None"
ARROW = "→"
SKIP_FIELDS = {"description", "cycles", "modules"}
LIST_FIELDS = {
    "assignees": ("Assigned to", ("assignee_ids", "assignees"), "user"),
    "labels": ("Labels", ("label_ids", "labels"), "label"),
}
SCALAR_LABELS = {
    "state": "State",
    "priority": "Priority",
    "name": "Title",
    "start_date": "Start date",
    "target_date": "Due date",
    "estimate_point": "Estimate",
    "parent": "Parent",
    "type": "Type",
    "link": "Link",
    "attachment": "Attachment",
    "comment": "Comment",
    "mention": "Mention",
    "issue": "Issue",
}
HEADLINE_ORDER = (
    "issue",
    "state",
    "assignees",
    "priority",
    "type",
    "labels",
    "name",
    "start_date",
    "target_date",
    "estimate_point",
    "parent",
    "comment",
    "mention",
    "created",
)


@dataclass(frozen=True)
class PropertyChange:
    field: str
    label: str
    old: str = NONE
    new: str = NONE
    kind: str = "transition"

    def as_line(self) -> str:
        if self.kind != "transition":
            if self.field == "created":
                return "Work item created"
            if self.new:
                return f"{self.label}: {self.new}"
            return self.label
        return f"{self.label}: {self.old} {ARROW} {self.new}"


def escape_mrkdwn(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _as_dict(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            loaded = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return loaded if isinstance(loaded, dict) else {}
    return {}


def _clip(value: str, limit: int = 80) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _display(value) -> str:
    if value is None:
        return NONE
    if isinstance(value, str):
        stripped = value.strip()
        if stripped in {"", "none", "None", "null"}:
            return NONE
        return _clip(stripped)
    if value == []:
        return NONE
    return _clip(str(value))


def _id_list(data: dict, *keys) -> list[str] | None:
    for key in keys:
        if key in data:
            raw = data.get(key)
            if raw is None:
                return []
            if not isinstance(raw, list):
                raw = [raw]
            seen: list[str] = []
            for item in raw:
                value = str(item)
                if value and value not in seen:
                    seen.append(value)
            return seen
    return None


def user_names_for_ids(ids: list[str], receiver_id=None) -> str:
    if not ids:
        return NONE
    users = {str(user.id): user for user in User.objects.filter(id__in=ids).only("id", "display_name", "email")}
    names = []
    for user_id in ids:
        if receiver_id is not None and str(user_id) == str(receiver_id):
            names.append("You")
            continue
        user = users.get(str(user_id))
        names.append((user.display_name or user.email) if user else "Unknown")
    return ", ".join(names) or NONE


def _label_names(ids: list[str]) -> str:
    if not ids:
        return NONE
    labels = {str(label.id): label.name for label in Label.objects.filter(id__in=ids).only("id", "name")}
    return ", ".join(labels.get(label_id) or "Unknown" for label_id in ids) or NONE


def _you_name(name, receiver=None) -> str:
    display = _display(name)
    if receiver is None or display == NONE:
        return display
    if display in {receiver.display_name, receiver.email}:
        return "You"
    return display


def _names_from_activities(activities: list[dict], field: str, receiver_id=None) -> tuple[str, str] | None:
    added: list[str] = []
    removed: list[str] = []
    added_ids: list[str] = []
    removed_ids: list[str] = []
    receiver = None
    if receiver_id is not None:
        receiver = User.objects.filter(pk=receiver_id).only("display_name", "email").first()
    for activity in activities:
        if activity.get("field") != field:
            continue
        new_id = activity.get("new_identifier")
        old_id = activity.get("old_identifier")
        if new_id:
            added_ids.append(str(new_id))
        elif activity.get("new_value"):
            added.append(_you_name(activity.get("new_value"), receiver))
        if old_id:
            removed_ids.append(str(old_id))
        elif activity.get("old_value"):
            removed.append(_you_name(activity.get("old_value"), receiver))
    if not added and not removed and not added_ids and not removed_ids:
        return None
    if field == "assignees":
        old = user_names_for_ids(removed_ids, receiver_id) if removed_ids else (", ".join(removed) or NONE)
        new = user_names_for_ids(added_ids, receiver_id) if added_ids else (", ".join(added) or NONE)
        return old, new
    if field == "labels":
        old = _label_names(removed_ids) if removed_ids else (", ".join(removed) or NONE)
        new = _label_names(added_ids) if added_ids else (", ".join(added) or NONE)
        return old, new
    return None


def format_property_changes(
    activities: list[dict] | None,
    *,
    current=None,
    requested=None,
    receiver_id=None,
    event_type: str | None = None,
) -> list[PropertyChange]:
    activities = activities or []
    current_data = _as_dict(current)
    requested_data = _as_dict(requested)
    changes: list[PropertyChange] = []
    seen: set[str] = set()

    for field, (label, keys, kind) in LIST_FIELDS.items():
        old_ids = _id_list(current_data, *keys)
        new_ids = _id_list(requested_data, *keys)
        if old_ids is not None and new_ids is not None and old_ids != new_ids:
            old = user_names_for_ids(old_ids, receiver_id) if kind == "user" else _label_names(old_ids)
            new = user_names_for_ids(new_ids, receiver_id) if kind == "user" else _label_names(new_ids)
            changes.append(PropertyChange(field=field, label=label, old=old, new=new))
            seen.add(field)
            continue
        fallback = _names_from_activities(activities, field, receiver_id)
        if fallback:
            changes.append(PropertyChange(field=field, label=label, old=fallback[0], new=fallback[1]))
            seen.add(field)

    for activity in activities:
        field = activity.get("field")
        if not field or field in SKIP_FIELDS or field in seen:
            continue
        if field == "issue" and activity.get("verb") == "deleted":
            changes.append(PropertyChange(field="issue", label="Deleted", kind="notice"))
            seen.add(field)
            continue
        if field == "comment":
            snippet = _clip(strip_tags(activity.get("new_value") or ""))
            changes.append(
                PropertyChange(field="comment", label="Comment", new=snippet or "added", kind="notice")
            )
            seen.add(field)
            continue
        if field == "mention":
            changes.append(PropertyChange(field="mention", label="Mention", new="mentioned you", kind="notice"))
            seen.add(field)
            continue
        label = SCALAR_LABELS.get(field, str(field).replace("_", " ").title())
        old = _display(activity.get("old_value"))
        new = _display(activity.get("new_value"))
        if old == new:
            continue
        changes.append(PropertyChange(field=field, label=label, old=old, new=new))
        seen.add(field)

    if not changes and event_type == "issue.activity.created":
        changes.append(PropertyChange(field="created", label="Created", kind="notice"))
    elif not changes:
        for activity in activities:
            if activity.get("verb") == "created" or activity.get("comment") == "created the issue":
                changes.append(PropertyChange(field="created", label="Created", kind="notice"))
                break
    return changes


def format_property_transitions(
    activities: list[dict] | None,
    *,
    current=None,
    requested=None,
    receiver_id=None,
    event_type: str | None = None,
) -> list[str]:
    return [
        change.as_line()
        for change in format_property_changes(
            activities, current=current, requested=requested, receiver_id=receiver_id, event_type=event_type
        )
    ]


def slack_user_mention(user, workspace_id) -> str:
    if not user:
        return "@Someone"
    link = (
        SlackUserConnection.objects.filter(
            user_id=user.id,
            workspace_connection__workspace_id=workspace_id,
            workspace_connection__is_enabled=True,
        )
        .only("slack_user_id")
        .first()
    )
    if link:
        return f"<@{link.slack_user_id}>"
    return f"@{user.display_name or user.email or 'Someone'}"


def format_thread_comment_for_slack(comment, workspace_id) -> str:
    body = strip_tags(comment.comment_html or "") or (comment.comment_stripped or "") or "Comment"
    mention = slack_user_mention(comment.actor, workspace_id)
    if mention.startswith("<@"):
        prefix = mention
    else:
        name = ""
        if comment.actor:
            name = comment.actor.display_name or comment.actor.email or ""
        prefix = f"*{escape_mrkdwn(name or 'Someone')}*"
    return f"{prefix}: {body}"


def _headline_phrase(change: PropertyChange) -> str:
    if change.kind != "transition":
        if change.field == "created":
            return "created a task"
        if change.field == "issue":
            return "deleted a task"
        if change.field == "comment":
            return f"commented: {change.new}" if change.new and change.new != "added" else "commented on a task"
        if change.field == "mention":
            return "mentioned you"
        return change.new or change.label.lower()
    templates = {
        "state": f"transitioned a task from {change.old} {ARROW} {change.new}",
        "assignees": f"changed assignee from {change.old} {ARROW} {change.new}",
        "priority": f"changed priority from {change.old} {ARROW} {change.new}",
        "type": f"changed type from {change.old} {ARROW} {change.new}",
        "name": f"renamed a task from {change.old} {ARROW} {change.new}",
        "labels": f"changed labels from {change.old} {ARROW} {change.new}",
    }
    return templates.get(change.field, f"changed {change.label.lower()} from {change.old} {ARROW} {change.new}")


def format_slack_headline(actor_mention: str, changes: list[PropertyChange] | None) -> str:
    mention = actor_mention or "@Someone"
    if not changes:
        return f":bell: {mention} updated a task"
    order = {field: index for index, field in enumerate(HEADLINE_ORDER)}
    ordered = sorted(changes, key=lambda change: order.get(change.field, 99))
    phrases = [_headline_phrase(change) for change in ordered]
    return f":bell: {mention} " + " · ".join(phrases)


def build_slack_headline(
    actor,
    workspace_id,
    activities: list[dict] | None,
    *,
    current=None,
    requested=None,
    receiver_id=None,
    event_type: str | None = None,
) -> str:
    changes = format_property_changes(
        activities,
        current=current,
        requested=requested,
        receiver_id=receiver_id,
        event_type=event_type,
    )
    return format_slack_headline(slack_user_mention(actor, workspace_id), changes)


def activities_from_models(activities) -> list[dict]:
    payload = []
    for activity in activities or []:
        payload.append(
            {
                "field": getattr(activity, "field", None),
                "old_value": getattr(activity, "old_value", None),
                "new_value": getattr(activity, "new_value", None),
                "old_identifier": str(activity.old_identifier) if getattr(activity, "old_identifier", None) else None,
                "new_identifier": str(activity.new_identifier) if getattr(activity, "new_identifier", None) else None,
                "verb": getattr(activity, "verb", None),
                "comment": getattr(activity, "comment", None),
            }
        )
    return payload
