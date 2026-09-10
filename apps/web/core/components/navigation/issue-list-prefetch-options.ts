/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueDisplayFilterOptions, IssuePaginationOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";

/**
 * First-page pagination options each layout root requests on mount. Kept here
 * so a hover prefetch asks for exactly the page the layout will ask for; a
 * mismatch is harmless (the prefetch is simply not reused) but wasted.
 *
 * Mirrors: base-list-root, base-spreadsheet-root, base-kanban-root,
 * base-gantt-root. Calendar depends on the month/week toggle and is skipped.
 */
export function getIssueListPrefetchOptions(
  displayFilters: IIssueDisplayFilterOptions | undefined
): IssuePaginationOptions | undefined {
  const layout = displayFilters?.layout ?? EIssueLayoutTypes.LIST;
  switch (layout) {
    case EIssueLayoutTypes.LIST:
      return { canGroup: true, perPageCount: displayFilters?.group_by ? 50 : 100 };
    case EIssueLayoutTypes.SPREADSHEET:
      return { canGroup: false, perPageCount: 100 };
    case EIssueLayoutTypes.KANBAN:
      return { canGroup: true, perPageCount: 10 };
    case EIssueLayoutTypes.GANTT:
      return { canGroup: false, perPageCount: 100 };
    default:
      return undefined;
  }
}
