/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { lazy, Suspense, useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
// hooks
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectView } from "@/hooks/store/use-project-view";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { ActiveLoader } from "../issue-layout-HOC";

const ProjectViewCalendarLayout = lazy(() =>
  import("../calendar/roots/project-view-root").then((module) => ({ default: module.ProjectViewCalendarLayout }))
);
const BaseGanttRoot = lazy(() => import("../gantt").then((module) => ({ default: module.BaseGanttRoot })));
const ProjectViewKanBanLayout = lazy(() =>
  import("../kanban/roots/project-view-root").then((module) => ({ default: module.ProjectViewKanBanLayout }))
);
const ProjectViewListLayout = lazy(() =>
  import("../list/roots/project-view-root").then((module) => ({ default: module.ProjectViewListLayout }))
);
const ProjectViewSpreadsheetLayout = lazy(() =>
  import("../spreadsheet/roots/project-view-root").then((module) => ({ default: module.ProjectViewSpreadsheetLayout }))
);
const IssuePeekOverview = lazy(() =>
  import("../../peek-overview").then((module) => ({ default: module.IssuePeekOverview }))
);

function ProjectViewIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined; viewId: string }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ProjectViewListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <ProjectViewKanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <ProjectViewCalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={props.viewId} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ProjectViewSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ProjectViewLayoutRoot = observer(function ProjectViewLayoutRoot() {
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, viewId: routerViewId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug?.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId?.toString() : undefined;
  const viewId = routerViewId ? routerViewId?.toString() : undefined;
  // hooks
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT_VIEW);
  const { getViewById } = useProjectView();
  if (workspaceSlug && viewId) {
    issuesFilter?.hydrateFilters(workspaceSlug, viewId);
  }
  // derived values
  const projectView = viewId ? getViewById(viewId) : undefined;
  const workItemFilters = viewId ? issuesFilter?.getIssueFilters(viewId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout;
  const initialWorkItemFilters = projectView
    ? {
        displayFilters: workItemFilters?.displayFilters,
        displayProperties: workItemFilters?.displayProperties,
        kanbanFilters: workItemFilters?.kanbanFilters,
        richFilters: projectView.rich_filters,
      }
    : undefined;

  useSWR(
    workspaceSlug && projectId && viewId ? `PROJECT_VIEW_ISSUES_${workspaceSlug}_${projectId}_${viewId}` : null,
    async () => {
      if (workspaceSlug && projectId && viewId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, viewId);
      }
    }
  );

  useEffect(
    () => () => {
      if (workspaceSlug && viewId) {
        issuesFilter?.resetFilters(workspaceSlug, viewId);
      }
    },
    [issuesFilter, workspaceSlug, viewId]
  );

  if (!workspaceSlug || !projectId || !viewId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT_VIEW}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        saveViewOptions={{
          label: "Save as",
        }}
        enableUpdateView
        entityId={viewId}
        entityType={EIssuesStoreType.PROJECT_VIEW}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId, viewId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: projectViewWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            {projectViewWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={projectViewWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.HEADER_SAVE_VIEW_BUTTON,
                }}
              />
            )}
            <div className="relative h-full w-full overflow-auto">
              <Suspense fallback={<ActiveLoader layout={activeLayout} />}>
                <ProjectViewIssueLayout activeLayout={activeLayout} viewId={viewId.toString()} />
              </Suspense>
            </div>
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
