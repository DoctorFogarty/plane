/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  getIssueLayoutFromPathSlug,
  getIssueLayoutPathSlug,
  getIssueLayoutSlugFromPathname,
  getProjectIssuesLayoutHref,
  isIssueLayoutPathSlug,
  isProjectIssuesIndexPath,
  ISSUE_LAYOUT_NAV_ITEMS,
  ISSUE_LAYOUT_PATH_SLUG_MAP,
  ISSUE_LAYOUT_TO_PATH_SLUG,
} from "@plane/constants";
import { EIssueLayoutTypes } from "@plane/types";

describe("issue layout path mapping", () => {
  it("maps user-facing slugs to layout enum values", () => {
    expect(ISSUE_LAYOUT_PATH_SLUG_MAP.list).toBe(EIssueLayoutTypes.LIST);
    expect(ISSUE_LAYOUT_PATH_SLUG_MAP.board).toBe(EIssueLayoutTypes.KANBAN);
    expect(ISSUE_LAYOUT_PATH_SLUG_MAP.calendar).toBe(EIssueLayoutTypes.CALENDAR);
    expect(ISSUE_LAYOUT_PATH_SLUG_MAP.table).toBe(EIssueLayoutTypes.SPREADSHEET);
    expect(ISSUE_LAYOUT_PATH_SLUG_MAP.timeline).toBe(EIssueLayoutTypes.GANTT);
  });

  it("maps layout enum values back to user-facing slugs", () => {
    expect(ISSUE_LAYOUT_TO_PATH_SLUG[EIssueLayoutTypes.LIST]).toBe("list");
    expect(ISSUE_LAYOUT_TO_PATH_SLUG[EIssueLayoutTypes.KANBAN]).toBe("board");
    expect(ISSUE_LAYOUT_TO_PATH_SLUG[EIssueLayoutTypes.CALENDAR]).toBe("calendar");
    expect(ISSUE_LAYOUT_TO_PATH_SLUG[EIssueLayoutTypes.SPREADSHEET]).toBe("table");
    expect(ISSUE_LAYOUT_TO_PATH_SLUG[EIssueLayoutTypes.GANTT]).toBe("timeline");
  });

  it("round-trips every nav item through slug and layout helpers", () => {
    for (const item of ISSUE_LAYOUT_NAV_ITEMS) {
      expect(item.key).toBe(item.slug);
      expect(getIssueLayoutFromPathSlug(item.slug)).toBe(item.layout);
      expect(getIssueLayoutPathSlug(item.layout)).toBe(item.slug);
      expect(isIssueLayoutPathSlug(item.key)).toBe(true);
    }
  });

  it("treats unknown or empty slugs as invalid", () => {
    expect(isIssueLayoutPathSlug(undefined)).toBe(false);
    expect(isIssueLayoutPathSlug(null)).toBe(false);
    expect(isIssueLayoutPathSlug("")).toBe(false);
    expect(isIssueLayoutPathSlug("kanban")).toBe(false);
    expect(isIssueLayoutPathSlug("spreadsheet")).toBe(false);
    expect(isIssueLayoutPathSlug("gantt_chart")).toBe(false);
    expect(getIssueLayoutFromPathSlug("kanban")).toBeUndefined();
  });

  it("defaults missing layouts to the list slug", () => {
    expect(getIssueLayoutPathSlug(undefined)).toBe("list");
    expect(getIssueLayoutPathSlug(null)).toBe("list");
  });

  it("parses layout slugs from project issues pathnames", () => {
    expect(getIssueLayoutSlugFromPathname("/acme/projects/proj-1/issues/board")).toBe("board");
    expect(getIssueLayoutSlugFromPathname("/acme/projects/proj-1/issues/table/")).toBe("table");
    expect(getIssueLayoutSlugFromPathname("/acme/projects/proj-1/issues")).toBeUndefined();
    expect(getIssueLayoutSlugFromPathname("/acme/projects/proj-1/issues/PROJ-123")).toBeUndefined();
  });

  it("detects the exact /issues index path without matching layout URLs", () => {
    expect(isProjectIssuesIndexPath("/acme/projects/proj-1/issues")).toBe(true);
    expect(isProjectIssuesIndexPath("/acme/projects/proj-1/issues/")).toBe(true);
    expect(isProjectIssuesIndexPath("/acme/projects/proj-1/issues/board")).toBe(false);
    expect(isProjectIssuesIndexPath("/acme/projects/proj-1/cycles")).toBe(false);
  });

  it("builds a layout href from workspace, project, and layout", () => {
    expect(getProjectIssuesLayoutHref("acme", "proj-1", EIssueLayoutTypes.KANBAN)).toBe(
      "/acme/projects/proj-1/issues/board"
    );
    expect(getProjectIssuesLayoutHref("acme", "proj-1", undefined)).toBe("/acme/projects/proj-1/issues/list");
  });
});
