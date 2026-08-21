/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_KEY,
  getTabUrl,
  isNavHrefActive,
  LEGACY_WORK_ITEMS_TAB_KEY,
  resolveDefaultTabKey,
} from "@/components/navigation/tab-navigation-utils";

const LAYOUT_TAB_KEYS = ["list", "board", "calendar", "table", "timeline"];

describe("tab navigation utils", () => {
  it("maps layout tab keys to unique /issues/{slug} URLs", () => {
    expect(getTabUrl("acme", "proj-1", "list")).toBe("/acme/projects/proj-1/issues/list");
    expect(getTabUrl("acme", "proj-1", "board")).toBe("/acme/projects/proj-1/issues/board");
    expect(getTabUrl("acme", "proj-1", "calendar")).toBe("/acme/projects/proj-1/issues/calendar");
    expect(getTabUrl("acme", "proj-1", "table")).toBe("/acme/projects/proj-1/issues/table");
    expect(getTabUrl("acme", "proj-1", "timeline")).toBe("/acme/projects/proj-1/issues/timeline");
  });

  it("aliases the legacy work_items tab to /issues", () => {
    expect(getTabUrl("acme", "proj-1", LEGACY_WORK_ITEMS_TAB_KEY)).toBe("/acme/projects/proj-1/issues");
  });

  it("falls back unknown tab keys to /issues", () => {
    expect(getTabUrl("acme", "proj-1", "unknown")).toBe("/acme/projects/proj-1/issues");
  });

  it("keeps a valid stored default when it is still an available tab", () => {
    expect(resolveDefaultTabKey("board", LAYOUT_TAB_KEYS)).toBe("board");
    expect(resolveDefaultTabKey("cycles", [...LAYOUT_TAB_KEYS, "cycles"])).toBe("cycles");
  });

  it("preserves the work_items alias when it is no longer a visible tab", () => {
    expect(resolveDefaultTabKey(LEGACY_WORK_ITEMS_TAB_KEY, LAYOUT_TAB_KEYS)).toBe(LEGACY_WORK_ITEMS_TAB_KEY);
  });

  it("falls back missing or invalid defaults to list", () => {
    expect(DEFAULT_TAB_KEY).toBe("list");
    expect(resolveDefaultTabKey(undefined, LAYOUT_TAB_KEYS)).toBe("list");
    expect(resolveDefaultTabKey("overview", LAYOUT_TAB_KEYS)).toBe("list");
  });

  it("does not treat sibling layout URLs as the same tab", () => {
    expect(isNavHrefActive("/acme/projects/proj-1/issues/board", "/acme/projects/proj-1/issues/list")).toBe(false);
    expect(isNavHrefActive("/acme/projects/proj-1/issues/board", "/acme/projects/proj-1/issues/board")).toBe(true);
    expect(isNavHrefActive("/acme/projects/proj-1/issues/board/", "/acme/projects/proj-1/issues/board")).toBe(true);
  });
});
