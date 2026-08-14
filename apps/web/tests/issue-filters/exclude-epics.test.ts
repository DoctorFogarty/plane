/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { EIssueLayoutTypes, LOGICAL_OPERATOR } from "@plane/types";
import type { TIssueParams, TWorkItemFilterExpression } from "@plane/types";
import { shouldExcludeEpicsFromKanbanParams, workItemFiltersIncludeTypeId } from "@/helpers/kanban-epic-filter";
import { IssueFilterHelperStore } from "@/store/issue/helpers/issue-filter-helper.store";

const KANBAN_ACCEPTABLE_PARAMS: TIssueParams[] = [
  "filters",
  "group_by",
  "sub_group_by",
  "order_by",
  "type",
  "show_empty_groups",
  "sub_issue",
];

const LIST_ACCEPTABLE_PARAMS: TIssueParams[] = ["filters", "group_by", "order_by", "type", "show_empty_groups"];

describe("workItemFiltersIncludeTypeId", () => {
  it("returns false for empty or missing expressions", () => {
    expect(workItemFiltersIncludeTypeId(undefined)).toBe(false);
    expect(workItemFiltersIncludeTypeId({})).toBe(false);
  });

  it("returns true for a leaf type_id condition", () => {
    expect(workItemFiltersIncludeTypeId({ type_id__in: "epic-type-id" })).toBe(true);
  });

  it("returns false for unrelated leaf conditions", () => {
    expect(workItemFiltersIncludeTypeId({ priority__in: "urgent" })).toBe(false);
  });

  it("returns true when an AND group contains a type_id condition", () => {
    const expression: TWorkItemFilterExpression = {
      [LOGICAL_OPERATOR.AND]: [{ priority__in: "urgent" }, { type_id__in: "task-type-id" }],
    };
    expect(workItemFiltersIncludeTypeId(expression)).toBe(true);
  });

  it("returns false when an AND group has no type_id condition", () => {
    const expression: TWorkItemFilterExpression = {
      [LOGICAL_OPERATOR.AND]: [{ priority__in: "urgent" }, { state_id__in: "state-1" }],
    };
    expect(workItemFiltersIncludeTypeId(expression)).toBe(false);
  });
});

describe("shouldExcludeEpicsFromKanbanParams", () => {
  it("is true for work-item Kanban without a type_id filter", () => {
    expect(
      shouldExcludeEpicsFromKanbanParams({
        layout: EIssueLayoutTypes.KANBAN,
        richFilters: {},
        excludeEpicTypesOnKanban: true,
      })
    ).toBe(true);
  });

  it("is false for list layout", () => {
    expect(
      shouldExcludeEpicsFromKanbanParams({
        layout: EIssueLayoutTypes.LIST,
        richFilters: {},
        excludeEpicTypesOnKanban: true,
      })
    ).toBe(false);
  });

  it("is false when the store is an epic board", () => {
    expect(
      shouldExcludeEpicsFromKanbanParams({
        layout: EIssueLayoutTypes.KANBAN,
        richFilters: {},
        excludeEpicTypesOnKanban: false,
      })
    ).toBe(false);
  });

  it("is false when rich filters already constrain type_id", () => {
    expect(
      shouldExcludeEpicsFromKanbanParams({
        layout: EIssueLayoutTypes.KANBAN,
        richFilters: { type_id__in: "epic-type-id" },
        excludeEpicTypesOnKanban: true,
      })
    ).toBe(false);
  });
});

describe("computedFilteredParams exclude_epics", () => {
  it("sends exclude_epics on work-item Kanban", () => {
    const store = new IssueFilterHelperStore();
    const params = store.computedFilteredParams({}, { layout: EIssueLayoutTypes.KANBAN }, KANBAN_ACCEPTABLE_PARAMS);
    expect(params.exclude_epics).toBe(true);
  });

  it("does not send exclude_epics on list", () => {
    const store = new IssueFilterHelperStore();
    const params = store.computedFilteredParams({}, { layout: EIssueLayoutTypes.LIST }, LIST_ACCEPTABLE_PARAMS);
    expect(params.exclude_epics).toBeUndefined();
  });

  it("does not send exclude_epics when type_id is already filtered", () => {
    const store = new IssueFilterHelperStore();
    const params = store.computedFilteredParams(
      { type_id__in: "epic-type-id" },
      { layout: EIssueLayoutTypes.KANBAN },
      KANBAN_ACCEPTABLE_PARAMS
    );
    expect(params.exclude_epics).toBeUndefined();
  });

  it("does not send exclude_epics for epic boards", () => {
    const store = new IssueFilterHelperStore();
    store.excludeEpicTypesOnKanban = false;
    const params = store.computedFilteredParams({}, { layout: EIssueLayoutTypes.KANBAN }, KANBAN_ACCEPTABLE_PARAMS);
    expect(params.exclude_epics).toBeUndefined();
  });
});
