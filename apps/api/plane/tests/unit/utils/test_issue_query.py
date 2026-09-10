# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.response import Response

from plane.utils.grouper import ISSUE_BOARD_FIELDS as GROUPER_BOARD_FIELDS, board_row_value_fields
from plane.utils.issue_filters import hierarchy_filters_q, issue_filters
from plane.utils.issue_query import (
    ISSUE_BOARD_FIELDS,
    INTAKE_BOARD_COUNT_FILTER,
    InvalidBoardGrouping,
    PreparedIssueBoard,
    SavedViewNotFound,
    apply_board_filters,
    guest_issue_access_q,
    list_issue_board,
    paginate_issue_board,
    parse_group_param,
    resolve_saved_view_filters,
    wants_property_values,
)


class _FakeRequest:
    def __init__(self, get=None, expand=""):
        self.GET = get if get is not None else {"expand": expand}
        self.query_params = self.GET
        self.user = object()


class _FakeView:
    def __init__(self):
        self.paginate_kwargs = None

    def filter_queryset(self, queryset):
        return queryset

    def paginate(self, **kwargs):
        self.paginate_kwargs = kwargs
        return kwargs


@pytest.mark.unit
@pytest.mark.parametrize(
    "value,expected",
    [
        (None, None),
        (False, None),
        ("", None),
        ("false", None),
        ("False", None),
        ("none", None),
        ("null", None),
        ("  false  ", None),
        ("state_id", "state_id"),
        (" labels__id ", "labels__id"),
    ],
)
def test_parse_group_param(value, expected):
    assert parse_group_param(value) == expected


@pytest.mark.unit
def test_board_fields_are_the_single_row_contract():
    assert ISSUE_BOARD_FIELDS == GROUPER_BOARD_FIELDS
    assert "type_id" in ISSUE_BOARD_FIELDS
    assert "is_epic" in ISSUE_BOARD_FIELDS
    assert "state__group" in ISSUE_BOARD_FIELDS
    assert "assignee_ids" in ISSUE_BOARD_FIELDS
    assert "module_ids" in ISSUE_BOARD_FIELDS
    fields = board_row_value_fields("assignees__id", None)
    assert "assignee_ids" not in fields
    assert "assignees__id" in fields


@pytest.mark.unit
def test_paginate_does_not_default_intake_count_filter():
    view = _FakeView()
    paginate_issue_board(
        view,
        _FakeRequest(),
        slug="s",
        project_id="p",
        issue_queryset=[],
        filters={},
        order_by_param="-created_at",
        group_by="state_id",
        sub_group_by=None,
        group_values_fn=lambda **kwargs: [],
    )
    assert view.paginate_kwargs["count_filter"] is None


@pytest.mark.unit
def test_paginate_passes_explicit_intake_count_filter():
    view = _FakeView()
    paginate_issue_board(
        view,
        _FakeRequest(),
        slug="s",
        project_id="p",
        issue_queryset=[],
        filters={},
        order_by_param="-created_at",
        group_by="state_id",
        sub_group_by=None,
        count_filter=INTAKE_BOARD_COUNT_FILTER,
        group_values_fn=lambda **kwargs: [],
    )
    assert view.paginate_kwargs["count_filter"] is INTAKE_BOARD_COUNT_FILTER


@pytest.mark.unit
def test_paginate_raises_on_duplicate_grouping():
    with pytest.raises(InvalidBoardGrouping, match="same parameters"):
        paginate_issue_board(
            _FakeView(),
            _FakeRequest(),
            slug="s",
            project_id="p",
            issue_queryset=[],
            filters={},
            order_by_param="-created_at",
            group_by="state_id",
            sub_group_by="state_id",
        )


@pytest.mark.unit
def test_list_issue_board_maps_invalid_grouping(monkeypatch):
    monkeypatch.setattr(
        "plane.utils.issue_query.prepare_issue_board",
        lambda *args, **kwargs: PreparedIssueBoard(
            issue_queryset=[],
            filtered_issue_queryset=[],
            filters={},
            order_by_param="-created_at",
            group_by="state_id",
            sub_group_by="state_id",
        ),
    )
    response = list_issue_board(_FakeView(), _FakeRequest(), slug="s", project_id="p", queryset=[])
    assert isinstance(response, Response)
    assert response.status_code == 400
    assert "same parameters" in response.data["error"]


@pytest.mark.unit
def test_wants_property_values():
    assert wants_property_values(_FakeRequest(expand="property_values")) is True
    assert wants_property_values(_FakeRequest(expand="issue_relation,property_values")) is True
    assert wants_property_values(_FakeRequest(expand="issue_relation")) is False
    assert wants_property_values(_FakeRequest(expand="")) is False


@pytest.mark.unit
def test_guest_issue_access_q_requires_active_membership():
    q = guest_issue_access_q(user=object())
    assert q.children


@pytest.mark.unit
def test_hierarchy_filters_treat_show_sub_issues_as_sub_issue():
    hidden = hierarchy_filters_q({"show_sub_issues": "false"})
    explicit = hierarchy_filters_q({"sub_issue": "false"})
    assert hidden == explicit
    assert hierarchy_filters_q({"sub_issue": "true"}) == hierarchy_filters_q({})
    combined = hierarchy_filters_q({"sub_issue": "false", "exclude_epics": "true"})
    assert combined != explicit


@pytest.mark.unit
def test_apply_board_filters_uses_rich_tree_only(monkeypatch):
    applied = {}

    def fake_filter(self, request, queryset, view, filter_data=None):
        applied["filter_data"] = filter_data
        return queryset

    monkeypatch.setattr(
        "plane.utils.issue_query.IssueComplexFilterBackend.filter_queryset",
        fake_filter,
    )
    queryset, filters = apply_board_filters(
        ["qs"],
        _FakeRequest(get={"filters": '{"priority__in":["high"]}', "state": "ignored"}),
        view=_FakeView(),
    )
    assert queryset == ["qs"]
    assert applied["filter_data"] == {"priority__in": ["high"]}
    assert filters == {}


@pytest.mark.unit
def test_resolve_saved_view_filters_requires_valid_id(monkeypatch):
    class _QS:
        def filter(self, *args, **kwargs):
            return self

        def only(self, *args, **kwargs):
            return self

        def first(self):
            return None

    class _Manager:
        def filter(self, *args, **kwargs):
            return _QS()

    monkeypatch.setattr("plane.utils.issue_query.IssueView.objects", _Manager())
    with pytest.raises(SavedViewNotFound):
        resolve_saved_view_filters(_FakeRequest(get={"view_id": "missing"}), slug="ws")


@pytest.mark.unit
def test_inbox_status_aliases_intake_status():
    inbox = issue_filters({"inbox_status": "1,-1"}, "GET")
    intake = issue_filters({"intake_status": "1,-1"}, "GET")
    assert inbox == intake
    assert inbox["issue_intake__status__in"] == ["1", "-1"]
