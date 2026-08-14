# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

PLANE_TRIGGER_TYPES = {
    "work_item.created",
    "work_item.updated",
    "work_item.state_changed",
    "work_item.assignee_changed",
    "work_item.comment_added",
}

GITHUB_TRIGGER_TYPES = {
    "github.branch_created",
    "github.pr_opened",
    "github.pr_ready_for_review",
    "github.pr_merged",
    "github.pr_closed",
}

TRIGGER_TYPES = PLANE_TRIGGER_TYPES | GITHUB_TRIGGER_TYPES

CONDITION_FIELDS = {
    "state",
    "priority",
    "assignees",
    "labels",
    "work_item_type",
    "created_by",
}

CONDITION_OPERATORS = {
    "is",
    "is_not",
    "in",
    "contains",
    "gt",
    "gte",
    "lt",
    "lte",
}

ACTION_TYPES = {
    "change_property",
    "add_comment",
    "post_slack_message",
}

CHANGEABLE_PROPERTIES = {
    "priority",
    "state",
    "assignees",
    "labels",
    "start_date",
    "due_date",
    "cycle",
}
