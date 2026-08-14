/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { lazy, Suspense, useState } from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
// components
import { TransferIssues } from "@/components/cycles/transfer-issues";
import { TransferIssuesModal } from "@/components/cycles/transfer-issues-modal";
// hooks
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { ActiveLoader } from "../issue-layout-HOC";

const CycleCalendarLayout = lazy(() =>
  import("../calendar/roots/cycle-root").then((module) => ({ default: module.CycleCalendarLayout }))
);
const BaseGanttRoot = lazy(() => import("../gantt").then((module) => ({ default: module.BaseGanttRoot })));
const CycleKanBanLayout = lazy(() =>
  import("../kanban/roots/cycle-root").then((module) => ({ default: module.CycleKanBanLayout }))
);
const CycleListLayout = lazy(() =>
  import("../list/roots/cycle-root").then((module) => ({ default: module.CycleListLayout }))
);
const CycleSpreadsheetLayout = lazy(() =>
  import("../spreadsheet/roots/cycle-root").then((module) => ({ default: module.CycleSpreadsheetLayout }))
);
const IssuePeekOverview = lazy(() =>
  import("../../peek-overview").then((module) => ({ default: module.IssuePeekOverview }))
);

function CycleIssueLayout(props: {
  activeLayout: EIssueLayoutTypes | undefined;
  cycleId: string;
  isCompletedCycle: boolean;
}) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <CycleListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <CycleKanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <CycleCalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={props.cycleId} isCompletedCycle={props.isCompletedCycle} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <CycleSpreadsheetLayout />;
    default:
      return null;
  }
}

export const CycleLayoutRoot = observer(function CycleLayoutRoot() {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, cycleId: routerCycleId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const cycleId = routerCycleId ? routerCycleId.toString() : undefined;
  // store hooks
  const { issuesFilter } = useIssues(EIssuesStoreType.CYCLE);
  const { getCycleById } = useCycle();
  if (workspaceSlug && projectId && cycleId) {
    issuesFilter?.hydrateFilters(workspaceSlug, projectId, cycleId);
  }
  // state
  const [transferIssuesModal, setTransferIssuesModal] = useState(false);
  // derived values
  const workItemFilters = cycleId ? issuesFilter?.getIssueFilters(cycleId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout;

  useSWR(
    workspaceSlug && projectId && cycleId ? `CYCLE_ISSUES_${workspaceSlug}_${projectId}_${cycleId}` : null,
    async () => {
      if (workspaceSlug && projectId && cycleId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, cycleId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const cycleDetails = cycleId ? getCycleById(cycleId) : undefined;
  const cycleStatus = cycleDetails?.status?.toLocaleLowerCase() ?? "draft";
  const isCompletedCycle = cycleStatus === "completed";
  const isProgressSnapshotEmpty = isEmpty(cycleDetails?.progress_snapshot);
  const transferableIssuesCount = cycleDetails
    ? cycleDetails.backlog_issues + cycleDetails.unstarted_issues + cycleDetails.started_issues
    : 0;
  const canTransferIssues = isProgressSnapshotEmpty && transferableIssuesCount > 0;

  if (!workspaceSlug || !projectId || !cycleId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.CYCLE}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        entityType={EIssuesStoreType.CYCLE}
        entityId={cycleId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId, cycleId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: cycleWorkItemsFilter }) => (
          <>
            <TransferIssuesModal
              handleClose={() => setTransferIssuesModal(false)}
              cycleId={cycleId}
              isOpen={transferIssuesModal}
            />
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              {cycleStatus === "completed" && (
                <TransferIssues
                  handleClick={() => setTransferIssuesModal(true)}
                  canTransferIssues={canTransferIssues}
                  disabled={!isEmpty(cycleDetails?.progress_snapshot)}
                />
              )}
              {cycleWorkItemsFilter && (
                <WorkItemFiltersRow
                  filter={cycleWorkItemsFilter}
                  trackerElements={{
                    saveView: PROJECT_VIEW_TRACKER_ELEMENTS.CYCLE_HEADER_SAVE_AS_VIEW_BUTTON,
                  }}
                />
              )}
              <div className="h-full w-full overflow-auto">
                <Suspense fallback={<ActiveLoader layout={activeLayout} />}>
                  <CycleIssueLayout activeLayout={activeLayout} cycleId={cycleId} isCompletedCycle={isCompletedCycle} />
                </Suspense>
              </div>
              {/* peek overview */}
              <Suspense fallback={null}>
                <IssuePeekOverview />
              </Suspense>
            </div>
          </>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
