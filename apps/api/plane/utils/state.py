# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import UUID

from django.db import transaction
from django.utils import timezone

from plane.db.models import DraftIssue, Issue, State
from plane.db.models.state import StateGroup


class StateDeleteError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def fallback_state_id_from_request(request):
    value = request.query_params.get("fallback_state_id")
    if value:
        return value
    data = getattr(request, "data", None)
    if isinstance(data, dict):
        return data.get("fallback_state_id") or None
    return None


def _parse_uuid(value, field_name):
    if value is None or value == "":
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise StateDeleteError(f"Invalid {field_name}") from exc


def _state_has_work_items(state_id):
    return Issue.objects.filter(state=state_id).exists() or DraftIssue.objects.filter(state=state_id).exists()


def _reassign_work_items(source, fallback):
    now = timezone.now()
    updates = {"state": fallback, "updated_at": now}
    if fallback.group == StateGroup.COMPLETED.value:
        if source.group != StateGroup.COMPLETED.value:
            updates["completed_at"] = now
    else:
        updates["completed_at"] = None

    Issue.all_objects.filter(state=source).update(**updates)
    DraftIssue.all_objects.filter(state=source).update(**updates)


def delete_project_state(*, slug, project_id, state_id, fallback_state_id=None):
    """Soft-delete a project state, optionally moving work items first.

    Raises State.DoesNotExist when the state is missing or triage.
    Raises StateDeleteError for validation failures.
    """
    state = State.objects.get(is_triage=False, pk=state_id, project_id=project_id, workspace__slug=slug)

    if state.default:
        raise StateDeleteError("Default state cannot be deleted")

    fallback_uuid = _parse_uuid(fallback_state_id, "fallback_state_id")
    fallback = None
    if fallback_uuid is not None:
        if fallback_uuid == state.id:
            raise StateDeleteError("Fallback state must be different from the state being deleted")
        fallback = State.objects.filter(
            is_triage=False,
            pk=fallback_uuid,
            project_id=project_id,
            workspace__slug=slug,
        ).first()
        if fallback is None:
            raise StateDeleteError("Fallback state is invalid")

    with transaction.atomic():
        if _state_has_work_items(state.id):
            if fallback is None:
                raise StateDeleteError("The state is not empty, only empty states can be deleted")
            _reassign_work_items(state, fallback)
        elif fallback is not None:
            _reassign_work_items(state, fallback)

        state.delete()
