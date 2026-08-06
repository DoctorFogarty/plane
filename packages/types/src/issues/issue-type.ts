/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export type TIssuePropertyType = "TEXT" | "NUMBER" | "DROPDOWN" | "BOOLEAN" | "DATE" | "MEMBER" | "URL";

export type TIssuePropertySettings = {
  display_format?: "single" | "multi" | "single_line" | "multi_line" | "readonly" | string;
  format?: string;
  is_multi?: boolean;
  default_value?: unknown;
  readonly_value?: string;
  date_format?: string;
};

export type TIssuePropertyOption = {
  id: string;
  property_id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps | Record<string, unknown>;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  project_id: string;
  workspace_id: string;
};

export type TIssueProperty = {
  id: string;
  issue_type_id: string;
  name: string;
  description?: string;
  property_type: TIssuePropertyType;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  settings: TIssuePropertySettings;
  options?: TIssuePropertyOption[];
  project_id: string;
  workspace_id: string;
};

export type TIssueType = {
  id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps | Record<string, unknown>;
  is_epic: boolean;
  is_active: boolean;
  is_default: boolean;
  level: number;
  project_issue_type_id?: string | null;
  properties?: TIssueProperty[];
  workspace_id: string;
  created_at?: string;
  updated_at?: string;
};

export type TWorkItemTypesPropertiesAndOptionsResponse = {
  is_issue_type_enabled: boolean;
  issue_types: TIssueType[];
};

export type TIssuePropertyValuesMap = Record<string, unknown>;
