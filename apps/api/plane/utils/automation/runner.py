# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone

from plane.db.models import Automation, AutomationRun, AutomationRunStep, Issue
from plane.utils.automation.actions import execute_action
from plane.utils.automation.bot import get_or_create_automation_bot
from plane.utils.automation.conditions import evaluate_conditions
from plane.utils.exception_logger import log_exception


def _parse_json_dict(value) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value) if value else {}
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _normalize_id_list(value) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        return {str(item) for item in value if item is not None}
    return {str(value)}


def map_activity_to_triggers(activity_type: str, requested_data, current_instance) -> list[str]:
    """Map an issue_activity type + payload to automation trigger type strings."""
    requested_data = _parse_json_dict(requested_data)
    current_instance = _parse_json_dict(current_instance)

    if activity_type == "issue.activity.created":
        return ["work_item.created"]

    if activity_type == "comment.activity.created":
        return ["work_item.comment_added"]

    if activity_type != "issue.activity.updated":
        return []

    triggers = ["work_item.updated"]

    if "state_id" in requested_data or "state" in requested_data:
        new_state = requested_data.get("state_id", requested_data.get("state"))
        old_state = current_instance.get("state_id", current_instance.get("state"))
        if str(new_state or "") != str(old_state or ""):
            triggers.append("work_item.state_changed")

    if "assignee_ids" in requested_data or "assignees" in requested_data:
        new_assignees = requested_data.get("assignee_ids", requested_data.get("assignees"))
        old_assignees = current_instance.get("assignee_ids", current_instance.get("assignees"))
        if _normalize_id_list(new_assignees) != _normalize_id_list(old_assignees):
            triggers.append("work_item.assignee_changed")

    return triggers


def _trigger_matches(automation: Automation, trigger_type: str, changed_fields: set[str] | None) -> bool:
    if automation.trigger_type != trigger_type:
        return False
    if trigger_type == "work_item.updated":
        configured = (automation.trigger_config or {}).get("fields") or []
        if configured and changed_fields is not None:
            return bool(set(configured) & set(changed_fields))
    return True


def evaluate_automations_for_event(
    *,
    project_id,
    issue_id,
    trigger_types: list[str],
    trigger_payload: dict | None = None,
    event_key: str = "",
    changed_fields: set[str] | None = None,
    skip_if_automation: bool = False,
):
    """Find matching enabled automations and execute them for the given issue event."""
    if skip_if_automation:
        return []

    if not issue_id or not project_id or not trigger_types:
        return []

    issue = (
        Issue.objects.filter(pk=issue_id, project_id=project_id)
        .select_related("project", "workspace", "state", "type")
        .prefetch_related("assignees", "labels")
        .first()
    )
    if not issue:
        return []

    automations = (
        Automation.objects.filter(
            project_id=project_id,
            is_enabled=True,
            deleted_at__isnull=True,
            trigger_type__in=trigger_types,
        )
        .prefetch_related("conditions", "actions")
        .order_by("created_at")
    )

    bot = get_or_create_automation_bot(issue.workspace)
    results = []

    for automation in automations:
        matching_triggers = [
            t for t in trigger_types if _trigger_matches(automation, t, changed_fields)
        ]
        if not matching_triggers:
            continue

        trigger_type = matching_triggers[0]
        conditions = list(automation.conditions.filter(deleted_at__isnull=True).order_by("group", "order"))
        # Reload issue snapshot so create-race assignees/labels are visible
        issue = (
            Issue.objects.filter(pk=issue_id)
            .select_related("state", "type")
            .prefetch_related("assignees", "labels")
            .first()
        )
        if not issue:
            continue

        if not evaluate_conditions(issue, conditions):
            continue

        # Prefer an explicit per-event key (activity ids / GitHub delivery). Never fall back to a
        # stable per-issue key — that would make each automation fire at most once per issue.
        run_event_key = event_key or str(uuid.uuid4())
        try:
            with transaction.atomic():
                run = AutomationRun.objects.create(
                    automation=automation,
                    issue=issue,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                    status=AutomationRun.Status.SUCCESS,
                    trigger_type=trigger_type,
                    trigger_payload=trigger_payload or {},
                    event_key=run_event_key,
                )
        except IntegrityError:
            # Idempotent skip
            continue

        actions = list(automation.actions.filter(deleted_at__isnull=True).order_by("order", "created_at"))
        if not actions:
            run.status = AutomationRun.Status.SKIPPED
            run.error = "No actions configured"
            run.finished_at = timezone.now()
            run.save(update_fields=["status", "error", "finished_at", "updated_at"])
            results.append(run)
            continue

        failed = False
        for index, action in enumerate(actions):
            try:
                output = execute_action(issue, action, bot)
                AutomationRunStep.objects.create(
                    run=run,
                    action=action,
                    action_type=action.action_type,
                    status=AutomationRunStep.Status.SUCCESS,
                    input=action.config or {},
                    output=output or {},
                    order=index,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
            except Exception as exc:
                log_exception(exc)
                AutomationRunStep.objects.create(
                    run=run,
                    action=action,
                    action_type=action.action_type,
                    status=AutomationRunStep.Status.FAILED,
                    input=action.config or {},
                    output={},
                    error=str(exc),
                    order=index,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                )
                run.status = AutomationRun.Status.FAILED
                run.error = str(exc)
                failed = True
                break

        if not failed:
            run.status = AutomationRun.Status.SUCCESS
        run.finished_at = timezone.now()
        run.save(update_fields=["status", "error", "finished_at", "updated_at"])
        results.append(run)

    return results
