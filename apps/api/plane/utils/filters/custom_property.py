# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re
from datetime import datetime
from functools import reduce
from operator import or_
from uuid import UUID

from django.db.models import Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import IssueProperty, IssuePropertyType

CUSTOM_PROPERTY_FILTER_RE = re.compile(
    r"^customproperty_(?P<property_id>[0-9a-fA-F-]{36})__(?P<lookup>exact|in|range)$"
)

ALLOWED_LOOKUPS_BY_TYPE = {
    IssuePropertyType.TEXT: {"exact"},
    IssuePropertyType.URL: {"exact"},
    IssuePropertyType.NUMBER: {"exact"},
    IssuePropertyType.BOOLEAN: {"exact"},
    IssuePropertyType.DATE: {"exact", "range"},
    IssuePropertyType.DROPDOWN: {"exact", "in"},
    IssuePropertyType.MEMBER: {"exact", "in"},
}

# Stub FilterSet field names used for allowlist validation
CUSTOM_PROPERTY_VALUE_STUBS = {
    "customproperty_value",
    "customproperty_value__exact",
    "customproperty_value__in",
    "customproperty_value__range",
}


def is_custom_property_filter_key(field_name: str) -> bool:
    return bool(CUSTOM_PROPERTY_FILTER_RE.match(field_name or ""))


def transform_custom_property_field_for_validation(field_name: str) -> str:
    """Map customproperty_<id>__<lookup> to allowlisted stub names."""
    match = CUSTOM_PROPERTY_FILTER_RE.match(field_name or "")
    if not match:
        return field_name
    lookup = match.group("lookup")
    if lookup == "exact":
        return "customproperty_value"
    return f"customproperty_value__{lookup}"


def _parse_scalar_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [v for v in value if v is not None and str(v).strip() != ""]
    if isinstance(value, str):
        if value.strip() == "":
            return []
        if "," in value:
            return [part.strip() for part in value.split(",") if part.strip() != ""]
        return [value]
    return [value]


def _parse_datetime_value(raw):
    if isinstance(raw, datetime):
        return raw
    parsed = parse_datetime(str(raw))
    if parsed is not None:
        return parsed
    parsed_date = parse_date(str(raw))
    if parsed_date:
        return datetime.combine(parsed_date, datetime.min.time())
    raise DRFValidationError(
        {
            "message": f"Invalid date value '{raw}' for custom property filter",
            "code": "invalid_custom_property_value",
        }
    )


def _parse_boolean_value(raw):
    if isinstance(raw, bool):
        return raw
    if str(raw).lower() in ("true", "1", "yes"):
        return True
    if str(raw).lower() in ("false", "0", "no"):
        return False
    raise DRFValidationError(
        {
            "message": f"Invalid boolean value '{raw}' for custom property filter",
            "code": "invalid_custom_property_value",
        }
    )


def _base_property_q(property_id: UUID) -> Q:
    return Q(
        property_values__property_id=property_id,
        property_values__deleted_at__isnull=True,
    )


def _uuid_match_q(values) -> Q:
    uuid_values = []
    str_values = []
    for value in values:
        try:
            uuid_values.append(UUID(str(value)))
            str_values.append(str(value))
        except (TypeError, ValueError):
            raise DRFValidationError(
                {
                    "message": f"Invalid UUID value '{value}' for custom property filter",
                    "code": "invalid_custom_property_value",
                }
            )

    value_q = Q(property_values__value_uuid__in=uuid_values)
    json_clauses = [Q(property_values__value_json__contains=[s]) for s in str_values]
    if json_clauses:
        value_q |= reduce(or_, json_clauses)
    return value_q


def _build_value_q(property_obj: IssueProperty, lookup: str, raw_value) -> Q:
    property_type = property_obj.property_type
    allowed = ALLOWED_LOOKUPS_BY_TYPE.get(property_type, set())
    if lookup not in allowed:
        raise DRFValidationError(
            {
                "message": (
                    f"Lookup '{lookup}' is not allowed for custom property "
                    f"'{property_obj.name}' of type '{property_type}'"
                ),
                "code": "invalid_custom_property_lookup",
            }
        )

    if property_type in (IssuePropertyType.TEXT, IssuePropertyType.URL):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        # Treat exact as case-insensitive contains for text search usability
        return Q(property_values__value_text__icontains=str(values[0]))

    if property_type == IssuePropertyType.NUMBER:
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        try:
            number = float(values[0])
        except (TypeError, ValueError):
            raise DRFValidationError(
                {
                    "message": f"Invalid number value '{values[0]}' for custom property filter",
                    "code": "invalid_custom_property_value",
                }
            )
        return Q(property_values__value_number=number)

    if property_type == IssuePropertyType.BOOLEAN:
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        return Q(property_values__value_boolean=_parse_boolean_value(values[0]))

    if property_type == IssuePropertyType.DATE:
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        if lookup == "range":
            if len(values) < 2:
                raise DRFValidationError(
                    {
                        "message": "Date range filter requires start and end values",
                        "code": "invalid_custom_property_value",
                    }
                )
            start = _parse_datetime_value(values[0])
            end = _parse_datetime_value(values[1])
            return Q(property_values__value_datetime__range=(start, end))
        return Q(property_values__value_datetime=_parse_datetime_value(values[0]))

    if property_type in (IssuePropertyType.DROPDOWN, IssuePropertyType.MEMBER):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        return _uuid_match_q(values)

    raise DRFValidationError(
        {
            "message": f"Unsupported custom property type '{property_type}'",
            "code": "invalid_custom_property_type",
        }
    )


def build_custom_property_filter_q(field_name: str, raw_value, property_cache: dict | None = None) -> Q:
    """Build a Q object for a single customproperty_<id>__<lookup> condition."""
    match = CUSTOM_PROPERTY_FILTER_RE.match(field_name or "")
    if not match:
        raise DRFValidationError(
            {
                "message": f"Invalid custom property filter field '{field_name}'",
                "code": "invalid_custom_property_field",
            }
        )

    property_id = UUID(match.group("property_id"))
    lookup = match.group("lookup")

    cache = property_cache if property_cache is not None else {}
    property_obj = cache.get(property_id)
    if property_obj is None:
        property_obj = IssueProperty.objects.filter(id=property_id, deleted_at__isnull=True).first()
        if property_obj is None:
            raise DRFValidationError(
                {
                    "message": f"Custom property '{property_id}' was not found",
                    "code": "invalid_custom_property_field",
                }
            )
        cache[property_id] = property_obj

    if not property_obj.is_active:
        raise DRFValidationError(
            {
                "message": f"Custom property '{property_obj.name}' is not active",
                "code": "invalid_custom_property_field",
            }
        )

    value_q = _build_value_q(property_obj, lookup, raw_value)
    if value_q == Q():
        return Q()
    return _base_property_q(property_id) & value_q


def extract_custom_property_ids_from_filter(filter_data) -> list[UUID]:
    """Collect custom property UUIDs referenced in a filter tree."""
    ids: list[UUID] = []
    if not isinstance(filter_data, dict):
        return ids

    for key, value in filter_data.items():
        if key.lower() in ("or", "and"):
            if isinstance(value, list):
                for child in value:
                    ids.extend(extract_custom_property_ids_from_filter(child))
        elif key.lower() == "not":
            if isinstance(value, dict):
                ids.extend(extract_custom_property_ids_from_filter(value))
        else:
            match = CUSTOM_PROPERTY_FILTER_RE.match(key)
            if match:
                ids.append(UUID(match.group("property_id")))
    return ids


def preload_custom_properties(filter_data) -> dict:
    """Prefetch IssueProperty rows for all custom property filter keys."""
    property_ids = extract_custom_property_ids_from_filter(filter_data)
    if not property_ids:
        return {}
    properties = IssueProperty.objects.filter(id__in=property_ids, deleted_at__isnull=True)
    return {prop.id: prop for prop in properties}
