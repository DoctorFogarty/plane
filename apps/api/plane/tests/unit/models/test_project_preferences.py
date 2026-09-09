# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models.cycle import get_default_display_filters as cycle_display_filters
from plane.db.models.issue import get_default_display_filters as issue_display_filters
from plane.db.models.module import get_default_display_filters as module_display_filters
from plane.db.models.project import get_default_preferences, get_default_props
from plane.db.models.view import get_default_display_filters as view_display_filters
from plane.utils.view_preferences import (
    ViewQueryCompileError,
    apply_view_props_to_user_property,
    compile_issue_view_query,
    get_default_display_filters,
    get_default_display_properties,
    get_default_filters,
    get_default_view_preferences,
    get_default_view_props,
)


@pytest.mark.unit
def test_default_navigation_tab_is_list():
    preferences = get_default_preferences()
    assert preferences["navigation"]["default_tab"] == "list"
    assert preferences["navigation"]["hide_in_more_menu"] == []


@pytest.mark.unit
def test_view_preference_defaults_are_shared():
    assert get_default_filters() == get_default_view_props()["filters"]
    assert get_default_display_filters() == get_default_view_props()["display_filters"]
    assert get_default_display_filters()["layout"] == "list"
    assert get_default_display_properties()["state"] is True
    assert issue_display_filters() == cycle_display_filters() == module_display_filters() == view_display_filters()
    assert get_default_props()["display_filters"]["layout"] == "list"
    prefs = get_default_view_preferences()
    assert prefs["filters"] == get_default_filters()
    assert prefs["display_filters"] == get_default_display_filters()
    assert prefs["display_properties"] == get_default_display_properties()
    assert prefs["rich_filters"] == {}
    assert prefs["preferences"]["navigation"]["default_tab"] == "list"


@pytest.mark.unit
def test_compile_issue_view_query_fills_rich_filters():
    compiled, rich_filters = compile_issue_view_query({"priority": ["urgent"]}, {})
    assert compiled["priority__in"] == ["urgent"]
    assert "priority__in" in rich_filters


@pytest.mark.unit
def test_compile_issue_view_query_keeps_existing_rich_filters():
    existing = {"priority__exact": "high"}
    compiled, rich_filters = compile_issue_view_query({"priority": ["urgent"]}, existing)
    assert compiled["priority__in"] == ["urgent"]
    assert rich_filters == existing


@pytest.mark.unit
def test_compile_issue_view_query_raises_on_converter_failure(monkeypatch):
    class _Boom:
        def convert(self, *_args, **_kwargs):
            raise RuntimeError("bad filters")

    monkeypatch.setattr("plane.utils.filters.LegacyToRichFiltersConverter", _Boom)
    with pytest.raises(ViewQueryCompileError):
        compile_issue_view_query({"priority": ["urgent"]}, {})


@pytest.mark.unit
def test_apply_view_props_writes_live_layout_store():
    class _Property:
        filters = None
        display_filters = None
        display_properties = None
        rich_filters = None
        preferences = None
        sort_order = 1

    target = _Property()
    apply_view_props_to_user_property(
        target,
        view_props={
            "filters": {"priority": ["urgent"]},
            "display_filters": {"layout": "kanban"},
            "display_properties": {"state": False},
            "rich_filters": {"priority__in": ["urgent"]},
        },
        preferences={"navigation": {"default_tab": "board"}},
        sort_order=10,
    )
    assert target.filters == {"priority": ["urgent"]}
    assert target.display_filters == {"layout": "kanban"}
    assert target.display_properties == {"state": False}
    assert target.rich_filters == {"priority__in": ["urgent"]}
    assert target.preferences == {"navigation": {"default_tab": "board"}}
    assert target.sort_order == 10
