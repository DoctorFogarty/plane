/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueProperty } from "@plane/types";
import { hasRequiredCustomProperties } from "@/plane-web/components/issues/issue-properties/property-values";

/** Whether quick-add should open the full create modal instead of inline create. */
export function shouldOpenCreateModalForQuickAdd(properties: TIssueProperty[]): boolean {
  return hasRequiredCustomProperties(properties);
}
