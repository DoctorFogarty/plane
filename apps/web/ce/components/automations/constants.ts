/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAutomationActionType, TAutomationTriggerType } from "@plane/types";

export const PLANE_TRIGGERS: TAutomationTriggerType[] = [
  "work_item.created",
  "work_item.updated",
  "work_item.state_changed",
  "work_item.assignee_changed",
  "work_item.comment_added",
];

export const GITHUB_TRIGGERS: TAutomationTriggerType[] = [
  "github.branch_created",
  "github.pr_opened",
  "github.pr_ready_for_review",
  "github.pr_merged",
  "github.pr_closed",
];

export const ACTION_TYPES: TAutomationActionType[] = ["change_property", "add_comment", "post_slack_message"];

export const PRIORITY_OPTIONS = ["urgent", "high", "medium", "low", "none"];

export const TRIGGER_LABELS: Record<string, string> = {
  "work_item.created": "Work item created",
  "work_item.updated": "Work item updated",
  "work_item.state_changed": "State changed",
  "work_item.assignee_changed": "Assignee changed",
  "work_item.comment_added": "Comment added",
  "github.branch_created": "GitHub branch created",
  "github.pr_opened": "GitHub PR opened",
  "github.pr_ready_for_review": "GitHub PR ready for review",
  "github.pr_merged": "GitHub PR merged",
  "github.pr_closed": "GitHub PR closed",
};
