# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Canonical defaults for project / cycle / module / saved-view layout prefs."""


def get_default_filters():
    return {
        "priority": None,
        "state": None,
        "state_group": None,
        "assignees": None,
        "created_by": None,
        "labels": None,
        "start_date": None,
        "target_date": None,
        "subscriber": None,
    }


def get_default_display_filters():
    return {
        "group_by": None,
        "order_by": "-created_at",
        "type": None,
        "sub_issue": True,
        "show_empty_groups": True,
        "layout": "list",
        "calendar_date_range": "",
    }


def get_default_display_properties():
    return {
        "assignee": True,
        "attachment_count": True,
        "created_on": True,
        "due_date": True,
        "estimate": True,
        "key": True,
        "labels": True,
        "link": True,
        "priority": True,
        "start_date": True,
        "state": True,
        "sub_issue_count": True,
        "updated_on": True,
    }


def get_default_preferences():
    return {
        "pages": {"block_display": True},
        "navigation": {"default_tab": "list", "hide_in_more_menu": []},
    }


def get_default_view_props():
    return {
        "filters": get_default_filters(),
        "display_filters": get_default_display_filters(),
    }


def get_default_workspace_view_props():
    return {
        "filters": get_default_filters(),
        "display_filters": get_default_display_filters(),
        "display_properties": get_default_display_properties(),
    }


def get_default_view_preferences():
    """Single persist shape for live project / cycle / module / saved views."""
    return {
        "filters": get_default_filters(),
        "display_filters": get_default_display_filters(),
        "display_properties": get_default_display_properties(),
        "rich_filters": {},
        "preferences": get_default_preferences(),
    }


class ViewQueryCompileError(ValueError):
    """Raised when a saved-view filter blob cannot be compiled."""


def compile_issue_view_query(filters=None, rich_filters=None):
    """Compile a saved-view `query` blob and keep `rich_filters` in sync.

    Legacy `filters` still become the compiled `query` kwargs. If `rich_filters`
    is empty, convert those same filters so the two representations cannot drift.
    """
    from plane.utils.filters import LegacyToRichFiltersConverter
    from plane.utils.issue_filters import issue_filters

    filters = filters or {}
    rich_filters = rich_filters or {}
    try:
        compiled = issue_filters(filters, "POST") if filters else {}
        if filters and not rich_filters:
            rich_filters = LegacyToRichFiltersConverter().convert(filters, strict=False) or {}
    except ViewQueryCompileError:
        raise
    except Exception as exc:
        raise ViewQueryCompileError("Unable to compile view filters") from exc
    return compiled, rich_filters


def apply_view_props_to_user_property(user_property, view_props=None, preferences=None, sort_order=None):
    """Write the live ProjectUserProperty layout store from a view_props blob."""
    if isinstance(view_props, dict):
        if "filters" in view_props:
            user_property.filters = view_props["filters"]
        if "display_filters" in view_props:
            user_property.display_filters = view_props["display_filters"]
        if "display_properties" in view_props:
            user_property.display_properties = view_props["display_properties"]
        if "rich_filters" in view_props:
            user_property.rich_filters = view_props["rich_filters"]
        if "preferences" in view_props and preferences is None:
            user_property.preferences = view_props["preferences"]
    if preferences is not None:
        user_property.preferences = preferences
    if sort_order is not None:
        user_property.sort_order = sort_order
    return user_property
