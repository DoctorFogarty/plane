# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re
from uuid import UUID

from django.db.models import Q
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import IssueProperty, IssuePropertyType
from plane.utils.property_types import handler_for

CUSTOM_PROPERTY_FILTER_RE = re.compile(
    r"^customproperty_(?P<property_id>[0-9a-fA-F-]{36})__(?P<lookup>exact|in|range)$"
)

ALLOWED_LOOKUPS_BY_TYPE = {
    IssuePropertyType.TEXT: handler_for(IssuePropertyType.TEXT).allowed_lookups,
    IssuePropertyType.URL: handler_for(IssuePropertyType.URL).allowed_lookups,
    IssuePropertyType.NUMBER: handler_for(IssuePropertyType.NUMBER).allowed_lookups,
    IssuePropertyType.BOOLEAN: handler_for(IssuePropertyType.BOOLEAN).allowed_lookups,
    IssuePropertyType.DATE: handler_for(IssuePropertyType.DATE).allowed_lookups,
    IssuePropertyType.DROPDOWN: handler_for(IssuePropertyType.DROPDOWN).allowed_lookups,
    IssuePropertyType.MEMBER: handler_for(IssuePropertyType.MEMBER).allowed_lookups,
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


def _base_property_q(property_id: UUID) -> Q:
    return Q(
        property_values__property_id=property_id,
        property_values__deleted_at__isnull=True,
    )


def _build_value_q(property_obj: IssueProperty, lookup: str, raw_value) -> Q:
    handler = handler_for(property_obj.property_type)
    if lookup not in handler.allowed_lookups:
        raise DRFValidationError(
            {
                "message": (
                    f"Lookup '{lookup}' is not allowed for custom property "
                    f"'{property_obj.name}' of type '{property_obj.property_type}'"
                ),
                "code": "invalid_custom_property_lookup",
            }
        )
    return handler.filter_q(property_obj, lookup, raw_value)


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
