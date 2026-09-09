/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_KEY,
  getProjectSwitchUrl,
  getTabUrl,
  isNavHrefActive,
  isNavigationItemActive,
  LEGACY_WORK_ITEMS_TAB_KEY,
  resolveDefaultTabKey,
} from "@/components/navigation/tab-navigation-utils";

const LAYOUT_TAB_KEYS = ["list", "board", "calendar", "table", "timeline"];

describe("tab navigation utils", () => {
  it("uses the destination project's last tab, never the source project's", () => {
    const sourceTab = "board";
    const destinationTab = "list";
    expect(getProjectSwitchUrl("acme", "proj-b", destinationTab, LAYOUT_TAB_KEYS)).toBe(
      "/acme/projects/proj-b/issues/list"
    );
    expect(getProjectSwitchUrl("acme", "proj-b", destinationTab, LAYOUT_TAB_KEYS)).not.toBe(
      getTabUrl("acme", "proj-b", sourceTab)
    );
    expect(getProjectSwitchUrl("acme", "proj-b", "cycles", [...LAYOUT_TAB_KEYS, "cycles"])).toBe(
      "/acme/projects/proj-b/cycles"
    );
  });

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

  it("keeps views active only on the views index", () => {
    expect(
      isNavigationItemActive({
        item: { key: "views", href: "/acme/projects/proj-1/views" },
        pathname: "/acme/projects/proj-1/views",
        projectId: "proj-1",
      })
    ).toBe(true);
    expect(
      isNavigationItemActive({
        item: { key: "views", href: "/acme/projects/proj-1/views" },
        pathname: "/acme/projects/proj-1/views/view-1/board",
        projectId: "proj-1",
      })
    ).toBe(false);
  });

  it("marks the matching work-item layout tab when a work item is open", () => {
    expect(
      isNavigationItemActive({
        item: { key: "board", href: "/acme/projects/proj-1/issues/board" },
        pathname: "/acme/projects/proj-1/issues/PROJ-1",
        projectId: "proj-1",
        workItemId: "issue-1",
        workItem: { is_epic: false, project_id: "proj-1" },
        workItemLayoutNavKey: "board",
      })
    ).toBe(true);
    expect(
      isNavigationItemActive({
        item: { key: "list", href: "/acme/projects/proj-1/issues/list" },
        pathname: "/acme/projects/proj-1/issues/PROJ-1",
        projectId: "proj-1",
        workItemId: "issue-1",
        workItem: { is_epic: false, project_id: "proj-1" },
        workItemLayoutNavKey: "board",
      })
    ).toBe(false);
  });
});
