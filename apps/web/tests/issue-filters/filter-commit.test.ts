/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import { EIssueFilterType } from "@plane/constants";
import type { IIssueDisplayFilterOptions, IIssueFilters } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { IssueFilterHelperStore } from "@/store/issue/helpers/issue-filter-helper.store";

const seedFilters = (displayFilters: IIssueDisplayFilterOptions): Record<string, IIssueFilters> => ({
  entity: {
    richFilters: {},
    displayFilters,
    displayProperties: {},
    kanbanFilters: { group_by: [], sub_group_by: [] },
  },
});

describe("commitFilterTypeUpdate", () => {
  it("clears and refetches when kanban normalization changes grouping", async () => {
    const store = new IssueFilterHelperStore();
    const filters = seedFilters({ layout: EIssueLayoutTypes.LIST, group_by: null });
    const clear = vi.fn();
    const refetch = vi.fn();

    await store.commitFilterTypeUpdate({
      filters,
      entityId: "entity",
      type: EIssueFilterType.DISPLAY_FILTERS,
      patch: { layout: EIssueLayoutTypes.KANBAN },
      clear,
      refetch,
    });

    expect(filters.entity.displayFilters?.group_by).toBe("state");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not mutate the inbound display-filter patch", async () => {
    const store = new IssueFilterHelperStore();
    const filters = seedFilters({ layout: EIssueLayoutTypes.LIST, group_by: null });
    const patch: IIssueDisplayFilterOptions = { layout: EIssueLayoutTypes.KANBAN };

    await store.commitFilterTypeUpdate({
      filters,
      entityId: "entity",
      type: EIssueFilterType.DISPLAY_FILTERS,
      patch,
    });

    expect(patch).toEqual({ layout: EIssueLayoutTypes.KANBAN });
    expect(filters.entity.displayFilters?.group_by).toBe("state");
  });

  it("does not clear or refetch on a layout-only change", async () => {
    const store = new IssueFilterHelperStore();
    const filters = seedFilters({ layout: EIssueLayoutTypes.LIST, group_by: "state" });
    const clear = vi.fn();
    const refetch = vi.fn();

    await store.commitFilterTypeUpdate({
      filters,
      entityId: "entity",
      type: EIssueFilterType.DISPLAY_FILTERS,
      patch: { layout: EIssueLayoutTypes.KANBAN },
      clear,
      refetch,
    });

    expect(clear).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("clears and refetches when grouping changes", async () => {
    const store = new IssueFilterHelperStore();
    const filters = seedFilters({ layout: EIssueLayoutTypes.LIST, group_by: "state" });
    const clear = vi.fn();
    const refetch = vi.fn();

    await store.commitFilterTypeUpdate({
      filters,
      entityId: "entity",
      type: EIssueFilterType.DISPLAY_FILTERS,
      patch: { group_by: "priority" },
      clear,
      refetch,
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("refetches without clearing when order_by changes", async () => {
    const store = new IssueFilterHelperStore();
    const filters = seedFilters({ layout: EIssueLayoutTypes.LIST, group_by: "state", order_by: "sort_order" });
    const clear = vi.fn();
    const refetch = vi.fn();

    await store.commitFilterTypeUpdate({
      filters,
      entityId: "entity",
      type: EIssueFilterType.DISPLAY_FILTERS,
      patch: { order_by: "-created_at" },
      clear,
      refetch,
    });

    expect(clear).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
