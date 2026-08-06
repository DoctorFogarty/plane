/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueProperty } from "@plane/types";

type TUserDetailsLike =
  | {
      display_name?: string | null;
      email?: string | null;
    }
  | null
  | undefined;

/**
 * Resolve a stored property value (often option/member UUIDs) to a human-readable label.
 */
export function formatIssuePropertyDisplayValue(
  property: TIssueProperty,
  value: unknown,
  getUserDetails?: (id: string) => TUserDetailsLike
): string {
  if (value === null || value === undefined || value === "") return "";

  if (property.property_type === "BOOLEAN") {
    return value ? "Yes" : "No";
  }

  if (property.property_type === "DROPDOWN") {
    const options = (property.options || []).filter((o) => o.is_active);
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];
    return ids.map((id) => options.find((o) => o.id === id)?.name ?? id).join(", ");
  }

  if (property.property_type === "MEMBER") {
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];
    return ids
      .map((id) => {
        const member = getUserDetails?.(id);
        return member?.display_name || member?.email || id;
      })
      .join(", ");
  }

  if (property.property_type === "DATE") {
    return String(value).slice(0, 10);
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}
