/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "./common";
import type { TIssuePropertyType } from "./issues/issue-type";

export type TIntakeFormAccess = "PUBLIC" | "AUTHENTICATED";

export type TIntakeFormFieldSource = "system" | "property";

export type TIntakeFormField = {
  key: string;
  source: TIntakeFormFieldSource;
  required: boolean;
  property_id?: string;
  allowed_ids?: string[];
  name?: string;
  description?: string;
  property_type?: TIssuePropertyType;
  settings?: Record<string, unknown>;
  options?: { id: string; name: string }[];
  labels?: { id: string; name: string; color: string }[];
  max_count?: number;
  max_size?: number;
};

export type TIntakeForm = {
  id: string;
  name: string;
  description: string;
  anchor: string;
  is_enabled: boolean;
  access: TIntakeFormAccess;
  issue_type_id: string | null;
  fields: TIntakeFormField[];
  success_message: string;
  logo_props?: TLogoProps | Record<string, unknown>;
  project_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
};

export type TIntakeFormPayload = {
  name: string;
  description?: string;
  access?: TIntakeFormAccess;
  is_enabled?: boolean;
  issue_type_id?: string | null;
  fields?: TIntakeFormField[];
  success_message?: string;
};

export type TPublicIntakeFormSchema = {
  id: string;
  name: string;
  description: string;
  access: TIntakeFormAccess;
  success_message: string;
  logo_props?: TLogoProps | Record<string, unknown>;
  fields: TIntakeFormField[];
  project: {
    name: string;
    identifier: string;
    logo_props?: TLogoProps | Record<string, unknown>;
    emoji?: string | null;
    icon_prop?: Record<string, unknown> | null;
  };
  issue_type: {
    id: string;
    name: string;
    logo_props?: TLogoProps | Record<string, unknown>;
  } | null;
};

export type TPublicIntakeFormSubmission = {
  issue: {
    name: string;
    description_html?: string;
    priority?: string;
    label_ids?: string[];
  };
  property_values?: Record<string, unknown>;
  submitter_email?: string;
  submitter_name?: string;
  website?: string;
  attachment_ids?: string[];
};

export type TIntakeFormUploadedAttachment = {
  id: string;
  name: string;
  size: number;
};
