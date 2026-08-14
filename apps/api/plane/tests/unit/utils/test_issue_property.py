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
    get_issues_property_values_maps,
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

    def test_get_issues_property_values_maps_empty_input(self):
        assert get_issues_property_values_maps([]) == {}

    def test_get_issues_property_values_maps_groups_by_issue(self, monkeypatch):
        issue_a = uuid4()
        issue_b = uuid4()
        property_a = _FakeProperty(IssuePropertyType.TEXT)
        property_b = _FakeProperty(IssuePropertyType.NUMBER)

        value_a = _FakeValue()
        value_a.value_text = "alpha"
        value_a.issue_id = issue_a
        value_a.property_id = property_a.id
        value_a.property = property_a

        value_b = _FakeValue()
        value_b.value_number = 7
        value_b.issue_id = issue_b
        value_b.property_id = property_b.id
        value_b.property = property_b

        class _FakeQS(list):
            def select_related(self, *_args, **_kwargs):
                return self

            def filter(self, *_args, **_kwargs):
                return self

        class _FakeManager:
            def filter(self, **kwargs):
                assert "issue_id__in" in kwargs
                return _FakeQS([value_a, value_b])

        monkeypatch.setattr(
            "plane.utils.issue_property.IssuePropertyValue.objects",
            _FakeManager(),
        )

        result = get_issues_property_values_maps([issue_a, issue_b, uuid4()])
        assert result[str(issue_a)][str(property_a.id)] == "alpha"
        assert result[str(issue_b)][str(property_b.id)] == 7
        # Requested issues with no values still appear as empty maps
        empty_ids = [k for k, v in result.items() if v == {}]
        assert len(empty_ids) == 1
