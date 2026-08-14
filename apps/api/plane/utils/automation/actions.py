# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re
from datetime import date, datetime

from django.db.models import Q
from django.utils import timezone
from django.utils.html import escape, strip_tags

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    ProjectMember,
    State,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.issue_assignees import live_assignee_ids, live_assignee_names


TEMPLATE_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
VALID_PRIORITIES = {"urgent", "high", "medium", "low", "none"}


def _serialize_current(issue: Issue) -> dict:
    return {
        "priority": issue.priority,
        "state_id": str(issue.state_id) if issue.state_id else None,
        "start_date": str(issue.start_date) if issue.start_date else None,
        "target_date": str(issue.target_date) if issue.target_date else None,
        "assignee_ids": live_assignee_ids(issue),
        "label_ids": [str(lid) for lid in issue.labels.values_list("id", flat=True)],
    }


def _parse_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value)[:10])


def _render_template(template: str, issue: Issue) -> str:
    state_name = ""
    if issue.state_id:
        state = State.objects.filter(pk=issue.state_id).first()
        state_name = state.name if state else ""

    assignees = ", ".join(live_assignee_names(issue))

    context = {
        "priority": issue.priority or "",
        "state": state_name,
        "assignees": assignees,
        "name": issue.name or "",
    }

    def replacer(match):
        key = match.group(1)
        return str(context.get(key, match.group(0)))

    return TEMPLATE_RE.sub(replacer, template or "")


def _emit_activity(issue: Issue, actor_id, requested_data: dict, current_instance: dict | None, activity_type: str):
    issue_activity.delay(
        type=activity_type,
        requested_data=json.dumps({**requested_data, "automation": True}),
        actor_id=str(actor_id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=json.dumps(current_instance) if current_instance is not None else None,
        subscriber=False,
        epoch=int(timezone.now().timestamp()),
        notification=True,
    )


def _normalize_ids(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None and str(v)]
    return [str(value)]


def _validate_project_member_ids(issue: Issue, ids: list[str]) -> list[str]:
    if not ids:
        return []
    valid = {
        str(member_id)
        for member_id in ProjectMember.objects.filter(
            project_id=issue.project_id,
            member_id__in=ids,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
    }
    invalid = [assignee_id for assignee_id in ids if assignee_id not in valid]
    if invalid:
        raise ValueError(f"Invalid project member assignee(s): {', '.join(invalid)}")
    return ids


def _validate_label_ids(issue: Issue, ids: list[str]) -> list[str]:
    if not ids:
        return []
    valid = {
        str(label_id)
        for label_id in Label.objects.filter(
            pk__in=ids,
            workspace_id=issue.workspace_id,
            deleted_at__isnull=True,
        )
        .filter(Q(project_id=issue.project_id) | Q(project_id__isnull=True))
        .values_list("id", flat=True)
    }
    invalid = [label_id for label_id in ids if label_id not in valid]
    if invalid:
        raise ValueError(f"Invalid label(s) for project: {', '.join(invalid)}")
    return ids


def _ensure_issue_assignee(issue: Issue, assignee_id: str) -> None:
    existing = IssueAssignee.all_objects.filter(issue=issue, assignee_id=assignee_id).first()
    if existing:
        if existing.deleted_at is not None:
            existing.deleted_at = None
            existing.project_id = issue.project_id
            existing.workspace_id = issue.workspace_id
            existing.save(update_fields=["deleted_at", "project_id", "workspace_id", "updated_at"])
        return
    IssueAssignee.objects.create(
        issue=issue,
        assignee_id=assignee_id,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
    )


def _ensure_issue_label(issue: Issue, label_id: str) -> None:
    existing = IssueLabel.all_objects.filter(issue=issue, label_id=label_id).first()
    if existing:
        if existing.deleted_at is not None:
            existing.deleted_at = None
            existing.project_id = issue.project_id
            existing.workspace_id = issue.workspace_id
            existing.save(update_fields=["deleted_at", "project_id", "workspace_id", "updated_at"])
        return
    IssueLabel.objects.create(
        issue=issue,
        label_id=label_id,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
    )


def _sanitize_comment_html(comment_html: str) -> str:
    is_valid, error_msg, clean_html = validate_html_content(comment_html)
    if not is_valid:
        raise ValueError(error_msg or "Invalid comment HTML")
    if clean_html is not None:
        return clean_html
    # Plain text / empty after sanitize — escape and wrap
    text = strip_tags(comment_html).strip()
    if not text:
        return ""
    return f"<p>{escape(text)}</p>"


def execute_change_property(issue: Issue, config: dict, actor) -> dict:
    property_name = config.get("property") or config.get("property_name")
    change_type = config.get("change_type") or "set"
    value = config.get("value")

    if not property_name:
        raise ValueError("property is required for change_property")

    current = _serialize_current(issue)
    requested = {}
    update_fields = []

    if property_name == "priority":
        priority = value if value is not None else "none"
        if priority not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority: {priority}")
        issue.priority = priority
        update_fields.append("priority")
        requested["priority"] = issue.priority

    elif property_name == "state":
        state_id = value
        if not State.objects.filter(pk=state_id, project_id=issue.project_id).exists():
            raise ValueError("Invalid state for project")
        issue.state_id = state_id
        update_fields.append("state_id")
        requested["state_id"] = str(state_id)

    elif property_name in {"start_date", "due_date"}:
        field = "start_date" if property_name == "start_date" else "target_date"
        if change_type == "remove":
            setattr(issue, field, None)
        else:
            setattr(issue, field, _parse_date(value))
        update_fields.append(field)
        requested[field] = str(getattr(issue, field)) if getattr(issue, field) else None

    elif property_name == "assignees":
        ids = _validate_project_member_ids(issue, _normalize_ids(value))
        existing = set(live_assignee_ids(issue))
        if change_type == "remove":
            IssueAssignee.objects.filter(issue=issue, assignee_id__in=ids).delete()
            new_ids = list(existing - set(ids))
        elif change_type == "add":
            for assignee_id in ids:
                _ensure_issue_assignee(issue, assignee_id)
            new_ids = list(existing | set(ids))
        else:
            IssueAssignee.objects.filter(issue=issue).delete()
            for assignee_id in ids:
                _ensure_issue_assignee(issue, assignee_id)
            new_ids = ids
        requested["assignee_ids"] = new_ids

    elif property_name == "labels":
        ids = _validate_label_ids(issue, _normalize_ids(value))
        existing = set(str(lid) for lid in issue.labels.values_list("id", flat=True))
        if change_type == "remove":
            IssueLabel.objects.filter(issue=issue, label_id__in=ids).delete()
            new_ids = list(existing - set(ids))
        elif change_type == "add":
            for label_id in ids:
                _ensure_issue_label(issue, label_id)
            new_ids = list(existing | set(ids))
        else:
            IssueLabel.objects.filter(issue=issue).delete()
            for label_id in ids:
                _ensure_issue_label(issue, label_id)
            new_ids = ids
        requested["label_ids"] = new_ids

    elif property_name == "cycle":
        if change_type == "remove" or not value:
            CycleIssue.objects.filter(issue=issue, deleted_at__isnull=True).delete()
            requested["cycle_id"] = None
        else:
            cycle = Cycle.objects.filter(pk=value, project_id=issue.project_id).first()
            if not cycle:
                raise ValueError("Invalid cycle for project")
            if cycle.end_date and cycle.end_date < timezone.now().date():
                raise ValueError("Cannot assign work item to an ended cycle")
            CycleIssue.objects.filter(issue=issue, deleted_at__isnull=True).delete()
            CycleIssue.objects.create(
                issue=issue,
                cycle=cycle,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
            )
            requested["cycle_id"] = str(cycle.id)
    else:
        raise ValueError(f"Unsupported property: {property_name}")

    if update_fields:
        issue.save(update_fields=update_fields + ["updated_at"])

    _emit_activity(issue, actor.id, requested, current, "issue.activity.updated")
    return {"property": property_name, "change_type": change_type, "requested": requested}


def execute_add_comment(issue: Issue, config: dict, actor) -> dict:
    template = config.get("comment_html") or config.get("comment") or config.get("text") or ""
    rendered = _render_template(template, issue)
    if not rendered.strip():
        raise ValueError("comment text is required")

    if not rendered.lstrip().startswith("<"):
        rendered = f"<p>{escape(rendered)}</p>"

    comment_html = _sanitize_comment_html(rendered)
    if not strip_tags(comment_html).strip():
        raise ValueError("comment text is required")

    comment = IssueComment.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        actor=actor,
        comment_html=comment_html,
        comment_json={},
        access="INTERNAL",
        created_by=actor,
    )

    _emit_activity(
        issue,
        actor.id,
        {
            "id": str(comment.id),
            "comment_html": comment.comment_html,
        },
        None,
        "comment.activity.created",
    )
    return {"comment_id": str(comment.id), "comment_stripped": strip_tags(comment_html)}


def execute_post_slack_message(issue: Issue, config: dict, actor) -> dict:
    channel_id = (config or {}).get("channel_id")
    if not channel_id:
        raise ValueError("channel_id is required")
    from plane.db.models import SlackChannelSubscription, SlackWorkspaceConnection
    from plane.utils.slack.tokens import bot_client

    text = _render_template((config or {}).get("text") or "{{name}}", issue)
    connection = None
    sub = SlackChannelSubscription.objects.filter(project_id=issue.project_id, channel_id=channel_id).select_related(
        "workspace_connection"
    ).first()
    if sub:
        connection = sub.workspace_connection
    else:
        connection = SlackWorkspaceConnection.objects.filter(
            workspace_id=issue.workspace_id, is_enabled=True
        ).first()
    if not connection:
        raise ValueError("Slack is not connected for this workspace")
    bot_client(connection).chat_postMessage(channel=channel_id, text=text or issue.name)
    return {"channel_id": channel_id, "text": text}


def execute_action(issue: Issue, action, actor) -> dict:
    if action.action_type == "change_property":
        return execute_change_property(issue, action.config or {}, actor)
    if action.action_type == "add_comment":
        return execute_add_comment(issue, action.config or {}, actor)
    if action.action_type == "post_slack_message":
        return execute_post_slack_message(issue, action.config or {}, actor)
    raise ValueError(f"Unsupported action type: {action.action_type}")
