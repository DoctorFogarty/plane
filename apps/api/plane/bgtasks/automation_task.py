# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import uuid

from celery import shared_task

from plane.utils.automation.runner import evaluate_automations_for_event, map_activity_to_triggers
from plane.utils.exception_logger import log_exception


@shared_task
def evaluate_automations(
    project_id,
    issue_id,
    trigger_types,
    trigger_payload=None,
    event_key="",
    changed_fields=None,
    skip_if_automation=False,
):
    try:
        return [
            str(run.id)
            for run in evaluate_automations_for_event(
                project_id=project_id,
                issue_id=issue_id,
                trigger_types=trigger_types or [],
                trigger_payload=trigger_payload or {},
                event_key=event_key or "",
                changed_fields=set(changed_fields or []),
                skip_if_automation=bool(skip_if_automation),
            )
        ]
    except Exception as e:
        log_exception(e)
        return []


@shared_task
def dispatch_automations_from_activity(
    activity_type,
    requested_data,
    current_instance,
    issue_id,
    project_id,
    activity_ids=None,
):
    try:
        parsed_requested = requested_data
        if isinstance(requested_data, str):
            try:
                parsed_requested = json.loads(requested_data) if requested_data else {}
            except (TypeError, ValueError):
                parsed_requested = {}

        skip = bool(parsed_requested and parsed_requested.get("automation"))
        triggers = map_activity_to_triggers(activity_type, parsed_requested, current_instance)
        if not triggers or not issue_id or not project_id:
            return []

        ids = [str(aid) for aid in (activity_ids or []) if aid]
        if ids:
            event_key = f"activity:{issue_id}:{'-'.join(ids)}"
        else:
            # Unique per dispatch so Plane events can re-fire; GitHub uses delivery ids instead.
            event_key = f"activity:{issue_id}:{uuid.uuid4()}"

        changed_fields = set((parsed_requested or {}).keys()) - {"automation"}
        return evaluate_automations(
            project_id=str(project_id),
            issue_id=str(issue_id),
            trigger_types=triggers,
            trigger_payload={
                "activity_type": activity_type,
                "requested_data": parsed_requested,
            },
            event_key=event_key,
            changed_fields=list(changed_fields),
            skip_if_automation=skip,
        )
    except Exception as e:
        log_exception(e)
        return []
