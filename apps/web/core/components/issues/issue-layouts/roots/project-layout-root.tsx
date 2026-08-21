/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { observer } from "mobx-react";
import { useLocation, useNavigate, useParams } from "react-router";
import useSWR from "swr";
// plane constants
import {
  EIssueFilterType,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  PROJECT_VIEW_TRACKER_ELEMENTS,
  getIssueLayoutFromPathSlug,
  getIssueLayoutSlugFromPathname,
  getProjectIssuesLayoutHref,
  isProjectIssuesIndexPath,
} from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { ActiveLoader } from "../issue-layout-HOC";

const CalendarLayout = lazy(() =>
  import("../calendar/roots/project-root").then((module) => ({ default: module.CalendarLayout }))
);
const BaseGanttRoot = lazy(() => import("../gantt").then((module) => ({ default: module.BaseGanttRoot })));
const KanBanLayout = lazy(() =>
  import("../kanban/roots/project-root").then((module) => ({ default: module.KanBanLayout }))
);
const ListLayout = lazy(() => import("../list/roots/project-root").then((module) => ({ default: module.ListLayout })));
const ProjectSpreadsheetLayout = lazy(() =>
  import("../spreadsheet/roots/project-root").then((module) => ({ default: module.ProjectSpreadsheetLayout }))
);
const IssuePeekOverview = lazy(() =>
  import("../../peek-overview").then((module) => ({ default: module.IssuePeekOverview }))
);

function ProjectIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <KanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ProjectSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ProjectLayoutRoot = observer(function ProjectLayoutRoot() {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const issueTypeStore = useIssueType();
  if (workspaceSlug && projectId) {
    issuesFilter?.hydrateFilters(workspaceSlug, projectId);
  }
  const workItemFilters = projectId ? issuesFilter?.getIssueFilters(projectId) : undefined;
  const layoutSlug = getIssueLayoutSlugFromPathname(pathname);
  const urlLayout = getIssueLayoutFromPathSlug(layoutSlug);
  const storedLayout = workItemFilters?.displayFilters?.layout;
  const activeLayout = urlLayout ?? storedLayout ?? EIssueLayoutTypes.LIST;
  const areProjectIssueTypesFetched = projectId ? !!issueTypeStore.fetchedMap[projectId] : false;
  const projectTypeRevision = projectId ? (issueTypeStore.projectRevisionMap[projectId] ?? 0) : 0;
  const isIssuesIndexPath = isProjectIssuesIndexPath(pathname);

  useSWR(
    workspaceSlug && projectId ? `PROJECT_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  useLayoutEffect(() => {
    if (!workspaceSlug || !projectId || !urlLayout || !workItemFilters) return;
    if (storedLayout === urlLayout) return;
    issuesFilter.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, { layout: urlLayout });
  }, [workspaceSlug, projectId, urlLayout, storedLayout, issuesFilter, workItemFilters]);

  useEffect(() => {
    if (!isIssuesIndexPath || !workspaceSlug || !projectId || !workItemFilters) return;
    navigate(getProjectIssuesLayoutHref(workspaceSlug, projectId, storedLayout), { replace: true });
  }, [isIssuesIndexPath, workspaceSlug, projectId, storedLayout, workItemFilters, navigate]);

  useEffect(() => {
    if (!projectId || !areProjectIssueTypesFetched) return;
    const allowedPropertyIds = issueTypeStore.getActiveProjectProperties(projectId).map((property) => property.id);
    issuesFilter.pruneCustomDisplayProperties(projectId, allowedPropertyIds);
  }, [projectId, issuesFilter, issueTypeStore, areProjectIssueTypesFetched, projectTypeRevision]);

  if (!workspaceSlug || !projectId || !workItemFilters) return null;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        entityType={EIssuesStoreType.PROJECT}
        entityId={projectId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: projectWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            {projectWorkItemsFilter ? (
              <WorkItemFiltersRow
                filter={projectWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            ) : null}
            <div className="relative h-full w-full overflow-auto bg-surface-1">
              {issues?.getIssueLoader() === "mutation" ? (
                <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : null}
              <Suspense fallback={<ActiveLoader layout={activeLayout} />}>
                <ProjectIssueLayout activeLayout={activeLayout} />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <IssuePeekOverview />
            </Suspense>
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
