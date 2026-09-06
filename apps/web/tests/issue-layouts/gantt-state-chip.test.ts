/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  GANTT_STATE_CHIP_DARK_FOREGROUND,
  GANTT_STATE_CHIP_FALLBACK_BACKGROUND,
  GANTT_STATE_CHIP_LIGHT_FOREGROUND,
  getGanttStateChipColors,
} from "@/components/issues/issue-layouts/gantt/state-chip";

describe("getGanttStateChipColors", () => {
  it("uses a light foreground on a dark fill", () => {
    expect(getGanttStateChipColors("#16a34a")).toEqual({
      backgroundColor: "#16a34a",
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    });
    expect(getGanttStateChipColors("#3f76ff")).toEqual({
      backgroundColor: "#3f76ff",
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    });
  });

  it("uses a dark foreground on a light fill", () => {
    expect(getGanttStateChipColors("#fde68a")).toEqual({
      backgroundColor: "#fde68a",
      color: GANTT_STATE_CHIP_DARK_FOREGROUND,
    });
    expect(getGanttStateChipColors("#d9d9d9")).toEqual({
      backgroundColor: "#d9d9d9",
      color: GANTT_STATE_CHIP_DARK_FOREGROUND,
    });
  });

  it("falls back safely for empty or invalid colors", () => {
    const fallback = {
      backgroundColor: GANTT_STATE_CHIP_FALLBACK_BACKGROUND,
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    };

    expect(getGanttStateChipColors(undefined)).toEqual(fallback);
    expect(getGanttStateChipColors(null)).toEqual(fallback);
    expect(getGanttStateChipColors("")).toEqual(fallback);
    expect(getGanttStateChipColors("   ")).toEqual(fallback);
    expect(getGanttStateChipColors("not-a-color")).toEqual(fallback);
    expect(getGanttStateChipColors("#fff")).toEqual(fallback);
  });

  it("accepts hex values without a leading hash", () => {
    expect(getGanttStateChipColors("16a34a")).toEqual({
      backgroundColor: "#16a34a",
      color: GANTT_STATE_CHIP_LIGHT_FOREGROUND,
    });
  });
});
