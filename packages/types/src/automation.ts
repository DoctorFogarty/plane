/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TAutomationTriggerType =
  | "work_item.created"
  | "work_item.updated"
  | "work_item.state_changed"
  | "work_item.assignee_changed"
  | "work_item.comment_added"
  | "github.branch_created"
  | "github.pr_opened"
  | "github.pr_ready_for_review"
  | "github.pr_merged"
  | "github.pr_closed";

export type TAutomationActionType = "change_property" | "add_comment" | "post_slack_message";

export type TAutomationConditionField = "state" | "priority" | "assignees" | "labels" | "work_item_type" | "created_by";

export type TAutomationConditionOperator = "is" | "is_not" | "in" | "contains" | "gt" | "gte" | "lt" | "lte";

export interface IAutomationCondition {
  id?: string;
  group: number;
  field: TAutomationConditionField;
  operator: TAutomationConditionOperator;
  value: unknown;
  order: number;
}

export interface IAutomationAction {
  id?: string;
  action_type: TAutomationActionType;
  config: Record<string, unknown>;
  order: number;
}

export interface IAutomation {
  id: string;
  project?: string;
  name: string;
  description: string;
  is_enabled: boolean;
  trigger_type: TAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  conditions?: IAutomationCondition[];
  actions?: IAutomationAction[];
  conditions_count?: number;
  actions_count?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface IAutomationRunStep {
  id: string;
  action_type: string;
  status: "success" | "failed" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string;
  order: number;
  created_at: string;
}

export interface IAutomationRun {
  id: string;
  automation: string;
  issue_id: string | null;
  status: "success" | "failed" | "skipped";
  trigger_type: string;
  trigger_payload: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
  error: string;
  steps?: IAutomationRunStep[];
  created_at: string;
}
