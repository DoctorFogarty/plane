# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Atomic work-item create used by project boards, draft convert, and intake."""

from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from plane.app.serializers import IssueCreateSerializer
from plane.db.models import Cycle, CycleIssue, Module, ModuleIssue, State, StateGroup
from plane.utils.issue_property import upsert_property_values


class WorkItemCreateError(Exception):
    def __init__(self, payload, status_code=400):
        self.payload = payload
        self.status_code = status_code
        super().__init__(str(payload))


def _parse_uuid(value, field):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise WorkItemCreateError({"error": f"{field} is not valid"}) from exc


def ensure_triage_state(project):
    """Return the project's triage state, creating the default row if missing."""
    triage_state = State.triage_objects.filter(project_id=project.id, workspace_id=project.workspace_id).first()
    if triage_state:
        return triage_state
    return State.objects.create(
        name="Triage",
        group=StateGroup.TRIAGE.value,
        project_id=project.id,
        workspace_id=project.workspace_id,
        color="#4E5355",
        sequence=65000,
        default=False,
    )


def _normalize_module_ids(module_ids):
    if module_ids in (None, ""):
        return []
    if not isinstance(module_ids, (list, tuple)):
        raise WorkItemCreateError({"error": "module_ids must be a list"})
    return [_parse_uuid(module_id, "module_ids") for module_id in module_ids if module_id]


def adapt_public_work_item_payload(data):
    """Map public REST field names onto the create-modal / IssueCreateSerializer shape."""
    payload = dict(data or {})
    if "assignee_ids" not in payload and "assignees" in payload:
        payload["assignee_ids"] = payload.pop("assignees")
    if "label_ids" not in payload and "labels" in payload:
        payload["label_ids"] = payload.pop("labels")
    return payload


def create_work_item(
    *,
    project,
    actor,
    data,
    allow_triage_state=False,
    validate_property_required=None,
    default_assignee_id=None,
    in_transaction=None,
):
    """
    Create a work item and its board relations in one transaction.

    Accepts the same body the create modal already sends: assignees, labels,
    type_id, property_values, cycle_id, and module_ids.

    `in_transaction(issue)` runs before commit so callers can attach intake
    rows, transfer draft files, or clear anonymous actors atomically.

    Required custom properties are enforced when types are enabled, unless the
    caller passes `validate_property_required=False` (public/space forms).
    """
    if validate_property_required is None:
        validate_property_required = bool(getattr(project, "is_issue_type_enabled", False))

    property_values = (data or {}).get("property_values") or {}
    if not isinstance(property_values, dict):
        raise WorkItemCreateError({"error": "property_values must be an object"})

    cycle_id = (data or {}).get("cycle_id") or None
    if cycle_id == "":
        cycle_id = None
    if cycle_id:
        cycle_id = _parse_uuid(cycle_id, "cycle_id")
        try:
            cycle_exists = Cycle.objects.filter(pk=cycle_id, project_id=project.id).exists()
        except (DjangoValidationError, ValueError) as exc:
            raise WorkItemCreateError({"error": "cycle_id is not valid for this project"}) from exc
        if not cycle_exists:
            raise WorkItemCreateError({"error": "cycle_id is not valid for this project"})

    module_ids = _normalize_module_ids((data or {}).get("module_ids"))
    if module_ids:
        try:
            found = {
                str(pk)
                for pk in Module.objects.filter(project_id=project.id, pk__in=module_ids).values_list("id", flat=True)
            }
        except (DjangoValidationError, ValueError) as exc:
            raise WorkItemCreateError({"error": "module_ids are not valid for this project"}) from exc
        if set(module_ids) - found:
            raise WorkItemCreateError({"error": "module_ids are not valid for this project"})

    serializer = IssueCreateSerializer(
        data=data,
        context={
            "project_id": project.id,
            "workspace_id": project.workspace_id,
            "default_assignee_id": (
                default_assignee_id if default_assignee_id is not None else project.default_assignee_id
            ),
            "allow_triage_state": allow_triage_state,
        },
    )
    if not serializer.is_valid():
        raise WorkItemCreateError(serializer.errors)

    with transaction.atomic():
        issue = serializer.save()

        if property_values or validate_property_required:
            _values, errors = upsert_property_values(
                issue=issue,
                project_id=project.id,
                workspace_id=project.workspace_id,
                property_values=property_values,
                actor_id=getattr(actor, "id", None),
                validate_required=validate_property_required,
            )
            if errors:
                raise WorkItemCreateError({"errors": errors})

        if cycle_id:
            CycleIssue.objects.create(
                cycle_id=cycle_id,
                issue_id=issue.id,
                project_id=project.id,
                workspace_id=project.workspace_id,
                created_by=actor,
                updated_by=actor,
            )

        if module_ids:
            ModuleIssue.objects.bulk_create(
                [
                    ModuleIssue(
                        issue_id=issue.id,
                        module_id=module_id,
                        project_id=project.id,
                        workspace_id=project.workspace_id,
                        created_by=actor,
                        updated_by=actor,
                    )
                    for module_id in module_ids
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        if in_transaction is not None:
            in_transaction(issue)

    return issue
