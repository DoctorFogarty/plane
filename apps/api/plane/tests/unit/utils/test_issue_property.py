# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime
from uuid import uuid4

import pytest

from plane.db.models.issue_property import IssuePropertyType
from plane.utils.issue_property import (
    _is_empty,
    apply_value_to_model,
    clear_value_fields,
    format_property_value_for_display,
    serialize_property_value,
    validate_property_value,
)


class _FakeProperty:
    def __init__(self, property_type, settings=None, name="Property", is_required=False, is_active=True):
        self.id = uuid4()
        self.property_type = property_type
        self.settings = settings or {}
        self.name = name
        self.is_required = is_required
        self.is_active = is_active


class _FakeValue:
    def __init__(self):
        self.value_text = None
        self.value_boolean = None
        self.value_number = None
        self.value_datetime = None
        self.value_uuid = None
        self.value_json = []


@pytest.mark.unit
class TestIssuePropertyUtils:
    def test_is_empty(self):
        assert _is_empty(None) is True
        assert _is_empty("") is True
        assert _is_empty("  ") is True
        assert _is_empty([]) is True
        assert _is_empty("value") is False
        assert _is_empty(0) is False
        assert _is_empty(False) is False

    def test_apply_text_and_number_values(self):
        value_obj = _FakeValue()
        apply_value_to_model(_FakeProperty(IssuePropertyType.TEXT), value_obj, "hello")
        assert value_obj.value_text == "hello"

        clear_value_fields(value_obj)
        apply_value_to_model(_FakeProperty(IssuePropertyType.NUMBER), value_obj, "12.5")
        assert value_obj.value_number == 12.5

    def test_apply_boolean_and_member_multi(self):
        value_obj = _FakeValue()
        apply_value_to_model(_FakeProperty(IssuePropertyType.BOOLEAN), value_obj, True)
        assert value_obj.value_boolean is True

        clear_value_fields(value_obj)
        apply_value_to_model(
            _FakeProperty(IssuePropertyType.MEMBER, {"is_multi": True}),
            value_obj,
            ["a", "b"],
        )
        assert value_obj.value_json == ["a", "b"]

    def test_apply_date_value(self):
        value_obj = _FakeValue()
        apply_value_to_model(_FakeProperty(IssuePropertyType.DATE), value_obj, "2025-01-15")
        assert isinstance(value_obj.value_datetime, datetime)
        assert value_obj.value_datetime.year == 2025
        assert value_obj.value_datetime.month == 1
        assert value_obj.value_datetime.day == 15

    def test_serialize_property_value(self):
        property_obj = _FakeProperty(IssuePropertyType.TEXT)
        value_obj = _FakeValue()
        value_obj.value_text = "abc"
        assert serialize_property_value(property_obj, value_obj) == "abc"
        assert serialize_property_value(property_obj, None) is None

    def test_validate_number_and_url(self):
        number_property = _FakeProperty(IssuePropertyType.NUMBER, name="Points")
        assert validate_property_value(number_property, "not-a-number", uuid4()) is not None
        assert validate_property_value(number_property, "10", uuid4()) is None

        url_property = _FakeProperty(IssuePropertyType.URL, name="Link")
        assert validate_property_value(url_property, "notaurl", uuid4()) is not None
        assert validate_property_value(url_property, "https://example.com", uuid4()) is None

    def test_validate_required_empty(self):
        required = _FakeProperty(IssuePropertyType.TEXT, name="Severity", is_required=True)
        assert validate_property_value(required, "", uuid4()) is not None
        assert validate_property_value(required, "high", uuid4()) is None

    def test_format_property_value_for_display_primitives(self):
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.BOOLEAN), True) == "Yes"
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.BOOLEAN), False) == "No"
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.TEXT), "hello") == "hello"
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.DATE), "2025-01-15T00:00:00") == "2025-01-15"
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.TEXT), None) is None
        assert format_property_value_for_display(_FakeProperty(IssuePropertyType.TEXT), "") is None
        assert (
            format_property_value_for_display(_FakeProperty(IssuePropertyType.TEXT), ["a", "b"]) == "a, b"
        )
