# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Single registry for custom-property serialize / apply / validate / filter."""

from datetime import datetime
from functools import reduce
from operator import or_
from uuid import UUID

from django.db.models import Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import IssuePropertyOption, IssuePropertyType, ProjectMember


def is_empty(value):
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


def is_multi_select(property_obj):
    settings = getattr(property_obj, "settings", None) or {}
    return bool(settings.get("is_multi") or settings.get("display_format") == "multi")


def _as_list(value):
    if isinstance(value, list):
        return value
    return [value]


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


def _uuid_match_q(values):
    uuid_values = []
    str_values = []
    for value in values:
        try:
            uuid_values.append(UUID(str(value)))
            str_values.append(str(value))
        except (TypeError, ValueError) as exc:
            raise DRFValidationError(
                {
                    "message": f"Invalid UUID value '{value}' for custom property filter",
                    "code": "invalid_custom_property_value",
                }
            ) from exc

    value_q = Q(property_values__value_uuid__in=uuid_values)
    json_clauses = [Q(property_values__value_json__contains=[s]) for s in str_values]
    if json_clauses:
        value_q |= reduce(or_, json_clauses)
    return value_q


class PropertyTypeHandler:
    allowed_lookups = {"exact"}

    def serialize(self, property_obj, value_obj):
        raise NotImplementedError

    def apply(self, property_obj, value_obj, value):
        raise NotImplementedError

    def validate(self, property_obj, value, project_id):
        return None

    def filter_q(self, property_obj, lookup, raw_value):
        raise NotImplementedError


class TextHandler(PropertyTypeHandler):
    def serialize(self, property_obj, value_obj):
        return value_obj.value_text

    def apply(self, property_obj, value_obj, value):
        value_obj.value_text = str(value)

    def filter_q(self, property_obj, lookup, raw_value):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        # Saved views send `exact`; treat it as contains so text search stays usable.
        return Q(property_values__value_text__icontains=str(values[0]))


class UrlHandler(TextHandler):
    def validate(self, property_obj, value, project_id):
        if not isinstance(value, str) or not (value.startswith("http://") or value.startswith("https://")):
            return f"Property '{property_obj.name}' must be a valid URL"
        return None


class NumberHandler(PropertyTypeHandler):
    def serialize(self, property_obj, value_obj):
        return value_obj.value_number

    def apply(self, property_obj, value_obj, value):
        value_obj.value_number = float(value)

    def validate(self, property_obj, value, project_id):
        try:
            float(value)
        except (TypeError, ValueError):
            return f"Property '{property_obj.name}' must be a number"
        return None

    def filter_q(self, property_obj, lookup, raw_value):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        try:
            number = float(values[0])
        except (TypeError, ValueError) as exc:
            raise DRFValidationError(
                {
                    "message": f"Invalid number value '{values[0]}' for custom property filter",
                    "code": "invalid_custom_property_value",
                }
            ) from exc
        return Q(property_values__value_number=number)


class BooleanHandler(PropertyTypeHandler):
    def serialize(self, property_obj, value_obj):
        return value_obj.value_boolean

    def apply(self, property_obj, value_obj, value):
        value_obj.value_boolean = bool(value)

    def filter_q(self, property_obj, lookup, raw_value):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        return Q(property_values__value_boolean=_parse_boolean_value(values[0]))


class DateHandler(PropertyTypeHandler):
    allowed_lookups = {"exact", "range"}

    def serialize(self, property_obj, value_obj):
        return value_obj.value_datetime.isoformat() if value_obj.value_datetime else None

    def apply(self, property_obj, value_obj, value):
        if isinstance(value, datetime):
            value_obj.value_datetime = value
            return
        parsed = parse_datetime(str(value))
        if parsed is None:
            parsed_date = parse_date(str(value))
            if parsed_date:
                parsed = datetime.combine(parsed_date, datetime.min.time())
        value_obj.value_datetime = parsed

    def filter_q(self, property_obj, lookup, raw_value):
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


class ChoiceHandler(PropertyTypeHandler):
    allowed_lookups = {"exact", "in"}

    def serialize(self, property_obj, value_obj):
        if is_multi_select(property_obj) or (
            isinstance(value_obj.value_json, list) and len(value_obj.value_json) > 0
        ):
            return value_obj.value_json or []
        return str(value_obj.value_uuid) if value_obj.value_uuid else None

    def apply(self, property_obj, value_obj, value):
        if is_multi_select(property_obj):
            values = value if isinstance(value, list) else [value]
            value_obj.value_json = [str(v) for v in values if v is not None]
            return
        value_obj.value_uuid = UUID(str(value))

    def validate(self, property_obj, value, project_id):
        ids = _as_list(value) if is_multi_select(property_obj) else [value]
        if not isinstance(ids, list):
            ids = [ids]
        if property_obj.property_type == IssuePropertyType.MEMBER:
            valid_ids = {
                str(mid)
                for mid in ProjectMember.objects.filter(
                    project_id=project_id,
                    is_active=True,
                    member_id__in=ids,
                ).values_list("member_id", flat=True)
            }
            for member_id in ids:
                if str(member_id) not in valid_ids:
                    return f"Invalid member for property '{property_obj.name}'"
            return None

        valid_ids = {
            str(oid)
            for oid in IssuePropertyOption.objects.filter(
                property_id=property_obj.id,
                project_id=project_id,
                is_active=True,
            ).values_list("id", flat=True)
        }
        for option_id in ids:
            if str(option_id) not in valid_ids:
                return f"Invalid option for property '{property_obj.name}'"
        return None

    def filter_q(self, property_obj, lookup, raw_value):
        values = _parse_scalar_list(raw_value)
        if not values:
            return Q()
        return _uuid_match_q(values)


PROPERTY_TYPE_HANDLERS = {
    IssuePropertyType.TEXT: TextHandler(),
    IssuePropertyType.URL: UrlHandler(),
    IssuePropertyType.NUMBER: NumberHandler(),
    IssuePropertyType.BOOLEAN: BooleanHandler(),
    IssuePropertyType.DATE: DateHandler(),
    IssuePropertyType.DROPDOWN: ChoiceHandler(),
    IssuePropertyType.MEMBER: ChoiceHandler(),
}


def handler_for(property_type):
    handler = PROPERTY_TYPE_HANDLERS.get(property_type)
    if handler is None:
        raise DRFValidationError(
            {
                "message": f"Unsupported custom property type '{property_type}'",
                "code": "invalid_custom_property_type",
            }
        )
    return handler
