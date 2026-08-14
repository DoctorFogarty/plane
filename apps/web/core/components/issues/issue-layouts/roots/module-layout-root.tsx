/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { lazy, Suspense } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Row, ERowVariant } from "@plane/ui";
// hooks
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { ActiveLoader } from "../issue-layout-HOC";

const ModuleCalendarLayout = lazy(() =>
  import("../calendar/roots/module-root").then((module) => ({ default: module.ModuleCalendarLayout }))
);
const BaseGanttRoot = lazy(() => import("../gantt").then((module) => ({ default: module.BaseGanttRoot })));
const ModuleKanBanLayout = lazy(() =>
  import("../kanban/roots/module-root").then((module) => ({ default: module.ModuleKanBanLayout }))
);
const ModuleListLayout = lazy(() =>
  import("../list/roots/module-root").then((module) => ({ default: module.ModuleListLayout }))
);
const ModuleSpreadsheetLayout = lazy(() =>
  import("../spreadsheet/roots/module-root").then((module) => ({ default: module.ModuleSpreadsheetLayout }))
);
const IssuePeekOverview = lazy(() =>
  import("../../peek-overview").then((module) => ({ default: module.IssuePeekOverview }))
);

function ModuleIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined; moduleId: string }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ModuleListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <ModuleKanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <ModuleCalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={props.moduleId} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ModuleSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ModuleLayoutRoot = observer(function ModuleLayoutRoot() {
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, moduleId: routerModuleId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const moduleId = routerModuleId ? routerModuleId.toString() : undefined;
  // hooks
  const { issuesFilter } = useIssues(EIssuesStoreType.MODULE);
  if (workspaceSlug && projectId && moduleId) {
    issuesFilter?.hydrateFilters(workspaceSlug, projectId, moduleId);
  }
  // derived values
  const workItemFilters = moduleId ? issuesFilter?.getIssueFilters(moduleId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout || undefined;

  useSWR(
    workspaceSlug && projectId && moduleId
      ? `MODULE_ISSUES_${workspaceSlug.toString()}_${projectId.toString()}_${moduleId.toString()}`
      : null,
    async () => {
      if (workspaceSlug && projectId && moduleId) {
        await issuesFilter?.fetchFilters(workspaceSlug.toString(), projectId.toString(), moduleId.toString());
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!workspaceSlug || !projectId || !moduleId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.MODULE}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        entityType={EIssuesStoreType.MODULE}
        entityId={moduleId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId, moduleId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: moduleWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            {moduleWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={moduleWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.MODULE_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            )}
            <Row variant={ERowVariant.HUGGING} className="h-full w-full overflow-auto">
              <Suspense fallback={<ActiveLoader layout={activeLayout} />}>
                <ModuleIssueLayout activeLayout={activeLayout} moduleId={moduleId} />
              </Suspense>
            </Row>
            {/* peek overview */}
            <Suspense fallback={null}>
              <IssuePeekOverview />
            </Suspense>
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
