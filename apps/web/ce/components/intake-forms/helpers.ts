/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";
import type { TIntakeFormField } from "@plane/types";

export const NATIVE_FORM_FIELDS: { key: string; i18nLabel: string; locked?: boolean }[] = [
  { key: "name", i18nLabel: "title", locked: true },
  { key: "description", i18nLabel: "description" },
  { key: "priority", i18nLabel: "priority" },
  { key: "labels", i18nLabel: "labels" },
  { key: "submitter_email", i18nLabel: "project_settings.features.intake.form.submitter_email" },
  { key: "submitter_name", i18nLabel: "project_settings.features.intake.form.submitter_name" },
];

export function defaultFormFields(): TIntakeFormField[] {
  return [
    { key: "name", source: "system", required: true },
    { key: "description", source: "system", required: false },
    { key: "submitter_email", source: "system", required: true },
    { key: "submitter_name", source: "system", required: false },
  ];
}

export function getIntakeFormPublicUrl(anchor: string): string {
  const origin =
    typeof window !== "undefined" && SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL;
  const base = `${origin}${SPACE_BASE_PATH}`.replace(/\/$/, "");
  return `${base}/forms/${anchor}`;
}
