/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { IState, IStateGroup } from "@plane/types";
import {
  deleteDisabledTooltipKey,
  getDefaultFallbackStateId,
  getFallbackStateOptions,
  getFirstGroupIdForCategory,
  getStateDeleteDisabledReason,
  isStateDeleteDisabled,
  sortStatesBySequence,
} from "@/components/project-states/helpers";

function makeState(overrides: Partial<IState> & Pick<IState, "id" | "name">): IState {
  return {
    color: "#60646C",
    default: false,
    description: "",
    group: "started",
    group_id: "group-started",
    project_id: "project-1",
    sequence: 1,
    workspace_id: "workspace-1",
    order: 1,
    ...overrides,
  };
}

describe("state delete helpers", () => {
  it("disables delete for the default state", () => {
    const state = makeState({ id: "s1", name: "Todo", default: true });
    expect(isStateDeleteDisabled(state)).toBe(true);
    expect(getStateDeleteDisabledReason(state)).toBe("default");
    expect(deleteDisabledTooltipKey("default")).toBe("project_settings.states.delete.cannot_delete_default");
  });

  it("allows delete when the state is the only one in its group", () => {
    const state = makeState({ id: "s1", name: "Todo" });
    expect(isStateDeleteDisabled(state)).toBe(false);
    expect(getStateDeleteDisabledReason(state)).toBeNull();
  });

  it("prefers a sibling in the same group as the default fallback", () => {
    const source = makeState({ id: "s1", name: "In Progress", group_id: "started" });
    const sibling = makeState({ id: "s2", name: "Review", group_id: "started" });
    const other = makeState({ id: "s3", name: "Todo", group: "unstarted", group_id: "unstarted", default: true });

    expect(getDefaultFallbackStateId([source, sibling, other], source)).toBe(sibling.id);
    expect(getFallbackStateOptions([source, sibling, other], source.id).map((state) => state.id)).toEqual([
      sibling.id,
      other.id,
    ]);
  });

  it("falls back to the project default, then the first other state", () => {
    const source = makeState({ id: "s1", name: "Review", group_id: "started" });
    const defaultState = makeState({
      id: "s2",
      name: "Todo",
      group: "unstarted",
      group_id: "unstarted",
      default: true,
    });
    const other = makeState({ id: "s3", name: "Done", group: "completed", group_id: "completed" });

    expect(getDefaultFallbackStateId([source, defaultState, other], source)).toBe(defaultState.id);
    expect(getDefaultFallbackStateId([source, other], source)).toBe(other.id);
    expect(getDefaultFallbackStateId([source], source)).toBeUndefined();
  });

  it("sorts states by sequence", () => {
    const later = makeState({ id: "s2", name: "Review", sequence: 30000 });
    const earlier = makeState({ id: "s1", name: "Todo", sequence: 15000 });
    expect(sortStatesBySequence([later, earlier]).map((state) => state.id)).toEqual(["s1", "s2"]);
  });

  it("returns the first group matching a category", () => {
    const groups: IStateGroup[] = [
      {
        id: "g-started",
        name: "Started",
        color: "#f59e0b",
        sequence: 1,
        category: "started",
        is_system: false,
        project_id: "p1",
        workspace_id: "w1",
      },
      {
        id: "g-review",
        name: "Review",
        color: "#f59e0b",
        sequence: 2,
        category: "started",
        is_system: false,
        project_id: "p1",
        workspace_id: "w1",
      },
    ];
    expect(getFirstGroupIdForCategory(groups, "started")).toBe("g-started");
    expect(getFirstGroupIdForCategory(groups, "completed")).toBeUndefined();
  });
});
