/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { subDays } from "date-fns";
// plane imports
import { EPastDurationFilters, MAX_INTAKE_FORM_ATTACHMENTS } from "@plane/constants";
import type { TIntakeFormUploadedAttachment } from "@plane/types";
// local imports
import { renderFormattedPayloadDate } from "./datetime";

export function parseIntakeFormAttachments(value: unknown): TIntakeFormUploadedAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: TIntakeFormUploadedAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    attachments.push({
      id: record.id,
      name: typeof record.name === "string" && record.name.length > 0 ? record.name : "file",
      size: typeof record.size === "number" && Number.isFinite(record.size) ? record.size : 0,
    });
  }
  return attachments;
}

export function canAcceptMoreIntakeFormAttachments(
  currentCount: number,
  incomingCount: number,
  maxCount: number = MAX_INTAKE_FORM_ATTACHMENTS
): boolean {
  if (currentCount < 0 || incomingCount < 0 || maxCount < 0) return false;
  return currentCount + incomingCount <= maxCount;
}

export const getCustomDates = (duration: EPastDurationFilters): string => {
  const today = new Date();
  let firstDay, lastDay;

  switch (duration) {
    case EPastDurationFilters.TODAY: {
      firstDay = renderFormattedPayloadDate(today);
      lastDay = renderFormattedPayloadDate(today);
      return `${firstDay};after,${lastDay};before`;
    }
    case EPastDurationFilters.YESTERDAY: {
      const yesterday = subDays(today, 1);
      firstDay = renderFormattedPayloadDate(yesterday);
      lastDay = renderFormattedPayloadDate(yesterday);
      return `${firstDay};after,${lastDay};before`;
    }
    case EPastDurationFilters.LAST_7_DAYS: {
      firstDay = renderFormattedPayloadDate(subDays(today, 7));
      lastDay = renderFormattedPayloadDate(today);
      return `${firstDay};after,${lastDay};before`;
    }
    case EPastDurationFilters.LAST_30_DAYS: {
      firstDay = renderFormattedPayloadDate(subDays(today, 30));
      lastDay = renderFormattedPayloadDate(today);
      return `${firstDay};after,${lastDay};before`;
    }
  }
};
