/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueFilters, TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { IssuePeekOverview } from "../peek-overview";
import { IssueLayoutRenderer } from "./issue-layout-renderer";

type TIssueLayoutShellProps = {
  storeType: EIssuesStoreType;
  workspaceSlug: string;
  projectId?: string;
  entityId: string;
  activeLayout: EIssueLayoutTypes | undefined;
  workItemFilters: IIssueFilters;
  filtersToShowByLayout: TWorkItemFilterProperty[];
  updateFilters: (filters: TWorkItemFilterExpression) => void;
  filterScope?: "project" | "workspace";
  enableSaveView?: boolean;
  enableUpdateView?: boolean;
  saveViewLabel?: string;
  trackerSaveView?: string;
  header?: ReactNode;
  toolbar?: ReactNode;
  content?: ReactNode;
  contentClassName?: string;
};

export const IssueLayoutShell = observer(function IssueLayoutShell(props: TIssueLayoutShellProps) {
  const {
    storeType,
    workspaceSlug,
    projectId,
    entityId,
    activeLayout,
    workItemFilters,
    filtersToShowByLayout,
    updateFilters,
    filterScope = "project",
    enableSaveView,
    enableUpdateView,
    saveViewLabel,
    trackerSaveView,
    header,
    toolbar,
    content,
    contentClassName = "relative h-full w-full overflow-auto",
  } = props;

  const filtersRow = (filter: IWorkItemFilterInstance | undefined) => (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {header}
      {filter ? (
        <WorkItemFiltersRow
          filter={filter}
          trackerElements={trackerSaveView ? { saveView: trackerSaveView } : undefined}
        />
      ) : null}
      {toolbar}
      <div className={contentClassName}>
        {content ?? (
          <IssueLayoutRenderer
            activeLayout={activeLayout}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            entityId={entityId}
          />
        )}
      </div>
      <IssuePeekOverview />
    </div>
  );

  const sharedFilterProps = {
    enableSaveView,
    enableUpdateView,
    saveViewOptions: saveViewLabel ? { label: saveViewLabel } : undefined,
    entityType: storeType,
    entityId,
    filtersToShowByLayout,
    initialWorkItemFilters: workItemFilters,
    updateFilters,
    workspaceSlug,
  };

  return (
    <IssuesStoreContext.Provider value={storeType}>
      {filterScope === "workspace" ? (
        <WorkspaceLevelWorkItemFiltersHOC {...sharedFilterProps}>
          {({ filter }) => filtersRow(filter)}
        </WorkspaceLevelWorkItemFiltersHOC>
      ) : projectId ? (
        <ProjectLevelWorkItemFiltersHOC {...sharedFilterProps} projectId={projectId}>
          {({ filter }) => filtersRow(filter)}
        </ProjectLevelWorkItemFiltersHOC>
      ) : null}
    </IssuesStoreContext.Provider>
  );
});
