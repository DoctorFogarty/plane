/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkItemFilterAndGroup, TWorkItemFilterExpression } from "@plane/types";
import { EIssueLayoutTypes, LOGICAL_OPERATOR } from "@plane/types";

const TYPE_ID_CONDITION_PREFIX = "type_id__";

/**
 * True when rich filters already constrain work item type, so Kanban should
 * not also send exclude_epics (an explicit Epic type filter must still work).
 */
export const workItemFiltersIncludeTypeId = (expression: TWorkItemFilterExpression | undefined): boolean => {
  if (!expression) return false;

  if (LOGICAL_OPERATOR.AND in expression) {
    const conditions = (expression as TWorkItemFilterAndGroup)[LOGICAL_OPERATOR.AND];
    if (!Array.isArray(conditions) || conditions.length === 0) return false;
    return conditions.some((condition) => workItemFiltersIncludeTypeId(condition));
  }

  return Object.keys(expression).some((key) => key.startsWith(TYPE_ID_CONDITION_PREFIX));
};

export const shouldExcludeEpicsFromKanbanParams = ({
  layout,
  richFilters,
  excludeEpicTypesOnKanban,
}: {
  layout: EIssueLayoutTypes | undefined;
  richFilters: TWorkItemFilterExpression | undefined;
  excludeEpicTypesOnKanban: boolean;
}): boolean => {
  if (!excludeEpicTypesOnKanban) return false;
  if (layout !== EIssueLayoutTypes.KANBAN) return false;
  if (workItemFiltersIncludeTypeId(richFilters)) return false;
  return true;
};
