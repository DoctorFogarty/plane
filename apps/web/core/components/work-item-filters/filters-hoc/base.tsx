/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { v4 as uuidv4 } from "uuid";
// plane imports
import type { TSaveViewOptions, TUpdateViewOptions } from "@plane/constants";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueFilters, TWorkItemFilterExpression } from "@plane/types";
// store hooks
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
// plane web imports
import type { TWorkItemFiltersEntityProps } from "@/hooks/work-item-filters/use-work-item-filters-config";
import { useWorkItemFiltersConfig } from "@/hooks/work-item-filters/use-work-item-filters-config";
// local imports
import type { TSharedWorkItemFiltersHOCProps, TSharedWorkItemFiltersProps } from "./shared";

type TAdditionalWorkItemFiltersProps = {
  saveViewOptions?: TSaveViewOptions<TWorkItemFilterExpression>;
  updateViewOptions?: TUpdateViewOptions<TWorkItemFilterExpression>;
} & TWorkItemFiltersEntityProps;

type TWorkItemFiltersHOCProps = TSharedWorkItemFiltersHOCProps & TAdditionalWorkItemFiltersProps;

export const WorkItemFiltersHOC = observer(function WorkItemFiltersHOC(props: TWorkItemFiltersHOCProps) {
  const { children, initialWorkItemFilters } = props;

  // Only initialize filter instance when initial work item filters are defined
  if (!initialWorkItemFilters)
    return <>{typeof children === "function" ? children({ filter: undefined }) : children}</>;

  return (
    <WorkItemFilterRoot {...props} initialWorkItemFilters={initialWorkItemFilters}>
      {children}
    </WorkItemFilterRoot>
  );
});

type TWorkItemFilterProps = TSharedWorkItemFiltersProps &
  TAdditionalWorkItemFiltersProps & {
    initialWorkItemFilters: IIssueFilters;
    children: React.ReactNode | ((props: { filter: IWorkItemFilterInstance | undefined }) => React.ReactNode);
  };

const WorkItemFilterRoot = observer(function WorkItemFilterRoot(props: TWorkItemFilterProps) {
  const {
    children,
    entityType,
    entityId,
    filtersToShowByLayout,
    initialWorkItemFilters,
    isTemporary,
    saveViewOptions,
    updateFilters,
    updateViewOptions,
    showOnMount,
    ...entityConfigProps
  } = props;
  // store hooks
  const { getFilter, getOrCreateFilter, deleteFilter } = useWorkItemFilters();
  // derived values
  const workItemEntityID = useMemo(
    () => (isTemporary ? `TEMP-${entityId ?? uuidv4()}` : entityId),
    [isTemporary, entityId]
  );
  const initialUserFilters = initialWorkItemFilters.richFilters;
  // Stable key so computedIssueFilters object churn does not thrash instance sync
  const initialUserFiltersKey = JSON.stringify(initialUserFilters ?? {});
  const workItemFiltersConfig = useWorkItemFiltersConfig({
    allowedFilters: filtersToShowByLayout ? filtersToShowByLayout : [],
    ...entityConfigProps,
  });

  // Observable read only. The instance is created in the layout effect below.
  // Creating it during render mutates the store while the header's
  // WorkItemFiltersToggle (already mounted) observes it; that schedules a sync
  // update which aborts the in-progress navigation render. On a project switch
  // React kept restarting until the transition lane expired (~5s per switch).
  const workItemLayoutFilter = getFilter(entityType, workItemEntityID);

  // Layout effect so the instance exists before paint; the resulting sync
  // re-render lands in the same frame, so there is no visible flicker.
  useLayoutEffect(() => {
    getOrCreateFilter({
      entityType,
      entityId: workItemEntityID,
      initialExpression: initialUserFilters,
      onExpressionChange: updateFilters,
      expressionOptions: {
        saveViewOptions,
        updateViewOptions,
      },
      showOnMount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialUserFiltersKey captures rich filter content
  }, [
    entityType,
    workItemEntityID,
    initialUserFiltersKey,
    updateFilters,
    saveViewOptions,
    updateViewOptions,
    showOnMount,
    getOrCreateFilter,
  ]);

  // delete filter instance when component unmounts
  useEffect(
    () => () => {
      deleteFilter(entityType, workItemEntityID);
    },
    [deleteFilter, entityType, workItemEntityID]
  );

  const configManager = workItemLayoutFilter?.configManager;
  useEffect(() => {
    if (!configManager) return;
    configManager.setAreConfigsReady(workItemFiltersConfig.areAllConfigsInitialized);
    configManager.replaceAll(workItemFiltersConfig.configs);
  }, [workItemFiltersConfig.areAllConfigsInitialized, workItemFiltersConfig.configs, configManager]);

  return <>{typeof children === "function" ? children({ filter: workItemLayoutFilter }) : children}</>;
});
