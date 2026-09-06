/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_WIDTH } from "@/components/gantt-chart/constants";
import { clampGanttSidebarWidth } from "@/components/gantt-chart/sidebar-width";

describe("clampGanttSidebarWidth", () => {
  it("keeps widths inside the allowed range", () => {
    expect(clampGanttSidebarWidth(SIDEBAR_WIDTH)).toBe(SIDEBAR_WIDTH);
    expect(clampGanttSidebarWidth(400)).toBe(400);
  });

  it("clamps to the minimum and maximum", () => {
    expect(clampGanttSidebarWidth(SIDEBAR_MIN_WIDTH - 80)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampGanttSidebarWidth(SIDEBAR_MAX_WIDTH + 80)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("falls back to the default for non-finite values", () => {
    expect(clampGanttSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH);
    expect(clampGanttSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_WIDTH);
  });

  it("rounds to a whole pixel", () => {
    expect(clampGanttSidebarWidth(360.6)).toBe(361);
  });
});
