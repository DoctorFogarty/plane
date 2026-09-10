/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { EIssueLayoutTypes } from "@plane/types";
import { getIssueListPrefetchOptions } from "@/components/navigation/issue-list-prefetch-options";

describe("getIssueListPrefetchOptions", () => {
  it("defaults to the list layout's first page when no layout is stored", () => {
    expect(getIssueListPrefetchOptions(undefined)).toEqual({ canGroup: true, perPageCount: 100 });
  });

  it("matches the page size the list root requests for grouped and flat lists", () => {
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.LIST, group_by: "state" })).toEqual({
      canGroup: true,
      perPageCount: 50,
    });
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.LIST, group_by: null })).toEqual({
      canGroup: true,
      perPageCount: 100,
    });
  });

  it("matches the other layout roots", () => {
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.SPREADSHEET })).toEqual({
      canGroup: false,
      perPageCount: 100,
    });
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.KANBAN })).toEqual({
      canGroup: true,
      perPageCount: 10,
    });
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.GANTT })).toEqual({
      canGroup: false,
      perPageCount: 100,
    });
  });

  it("skips the calendar, whose page depends on the month/week toggle", () => {
    expect(getIssueListPrefetchOptions({ layout: EIssueLayoutTypes.CALENDAR })).toBeUndefined();
  });
});
