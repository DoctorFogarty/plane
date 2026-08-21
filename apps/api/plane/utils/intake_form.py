# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email

from plane.db.models import IssueProperty, IssueType, Label, ProjectIssueType
from plane.db.models.issue_property import IssuePropertyType
from plane.db.models.intake import get_default_intake_form_fields

SYSTEM_FIELD_KEYS = frozenset(
    {
        "name",
        "description",
        "priority",
        "labels",
        "submitter_email",
        "submitter_name",
    }
)
ALLOWED_SOURCES = frozenset({"system", "property"})
PUBLIC_PROPERTY_TYPES = frozenset(
    {
        IssuePropertyType.TEXT,
        IssuePropertyType.NUMBER,
        IssuePropertyType.DROPDOWN,
        IssuePropertyType.BOOLEAN,
        IssuePropertyType.DATE,
        IssuePropertyType.URL,
    }
)


def _as_uuid(value):
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def validate_intake_form_fields(fields, *, project_id, issue_type_id, types_enabled):
    """
    Validate the form field schema. Returns a normalized list or raises ValueError.
    """
    if fields is None:
        fields = get_default_intake_form_fields()
    if not isinstance(fields, list) or len(fields) == 0:
        raise ValueError("fields must be a non-empty list")

    normalized = []
    seen_keys = set()
    has_name = False
    property_ids = []

    for index, raw in enumerate(fields):
        if not isinstance(raw, dict):
            raise ValueError(f"fields[{index}] must be an object")
        source = raw.get("source")
        key = raw.get("key")
        if source not in ALLOWED_SOURCES:
            raise ValueError(f"fields[{index}].source is invalid")
        if not key or not isinstance(key, str):
            raise ValueError(f"fields[{index}].key is required")
        if key in seen_keys:
            raise ValueError(f"Duplicate field key '{key}'")
        seen_keys.add(key)

        required = bool(raw.get("required", False))
        item = {"key": key, "source": source, "required": required}

        if source == "system":
            if key not in SYSTEM_FIELD_KEYS:
                raise ValueError(f"Unknown system field '{key}'")
            if key == "name":
                item["required"] = True
                has_name = True
            if key == "labels":
                allowed_ids = raw.get("allowed_ids") or []
                if not isinstance(allowed_ids, list):
                    raise ValueError("labels.allowed_ids must be a list")
                parsed_ids = []
                for label_id in allowed_ids:
                    parsed = _as_uuid(label_id)
                    if parsed is None:
                        raise ValueError("labels.allowed_ids must contain valid UUIDs")
                    parsed_ids.append(str(parsed))
                if parsed_ids:
                    existing = set(
                        str(pk)
                        for pk in Label.objects.filter(project_id=project_id, id__in=parsed_ids).values_list(
                            "id", flat=True
                        )
                    )
                    if existing != set(parsed_ids):
                        raise ValueError("labels.allowed_ids contains labels that are not in this project")
                item["allowed_ids"] = parsed_ids
        else:
            property_id = _as_uuid(raw.get("property_id") or key)
            if property_id is None:
                raise ValueError(f"fields[{index}].property_id is invalid")
            item["key"] = str(property_id)
            item["property_id"] = str(property_id)
            property_ids.append(property_id)

        normalized.append(item)

    if not has_name:
        raise ValueError("The name field is required on every form")

    if property_ids:
        if not types_enabled or not issue_type_id:
            raise ValueError("Custom properties require a work item type")
        properties = {
            str(p.id): p
            for p in IssueProperty.objects.filter(
                project_id=project_id,
                issue_type_id=issue_type_id,
                id__in=property_ids,
                is_active=True,
            )
        }
        for item in normalized:
            if item["source"] != "property":
                continue
            property_obj = properties.get(item["property_id"])
            if property_obj is None:
                raise ValueError("Property does not belong to the selected work item type")
            if property_obj.property_type == IssuePropertyType.MEMBER:
                raise ValueError("Member picker properties cannot be added to forms")
            if property_obj.property_type not in PUBLIC_PROPERTY_TYPES:
                raise ValueError(f"Property type '{property_obj.property_type}' is not supported on forms")

    return normalized


def validate_issue_type_for_project(*, project_id, issue_type_id, types_enabled):
    if not types_enabled:
        return None
    if not issue_type_id:
        raise ValueError("Work item type is required when types are enabled")
    parsed = _as_uuid(issue_type_id)
    if parsed is None:
        raise ValueError("Invalid work item type")
    exists = ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=parsed).exists()
    if not exists:
        raise ValueError("Work item type is not available on this project")
    if not IssueType.objects.filter(id=parsed, is_active=True).exists():
        raise ValueError("Work item type is not active")
    return parsed


def field_map(fields):
    return {item["key"]: item for item in fields or []}


def is_valid_email(value):
    if not value or not isinstance(value, str):
        return False
    try:
        validate_email(value.strip())
    except DjangoValidationError:
        return False
    return True
