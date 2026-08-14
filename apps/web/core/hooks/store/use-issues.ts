/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { StoreContext } from "@/lib/store-context";
// plane web types
import type { IProjectEpics, IProjectEpicsFilter } from "@/plane-web/store/issue/epic";
// types
import type { ITeamIssues, ITeamIssuesFilter } from "@/plane-web/store/issue/team";
import type { ITeamProjectWorkItemsFilter, ITeamProjectWorkItems } from "@/plane-web/store/issue/team-project";
import type { ITeamViewIssues, ITeamViewIssuesFilter } from "@/plane-web/store/issue/team-views";
import type { IWorkspaceIssues } from "@/plane-web/store/issue/workspace/issue.store";
import type { IArchivedIssues, IArchivedIssuesFilter } from "@/store/issue/archived";
import type { ICycleIssues, ICycleIssuesFilter } from "@/store/issue/cycle";
import type { IModuleIssues, IModuleIssuesFilter } from "@/store/issue/module";
import type { IProfileIssues, IProfileIssuesFilter } from "@/store/issue/profile";
import type { IProjectIssues, IProjectIssuesFilter } from "@/store/issue/project";
import type { IProjectViewIssues, IProjectViewIssuesFilter } from "@/store/issue/project-views";
import type { IWorkspaceIssuesFilter } from "@/store/issue/workspace";
import type { IWorkspaceDraftIssues, IWorkspaceDraftIssuesFilter } from "@/store/issue/workspace-draft";

export type TStoreIssues = {
  [EIssuesStoreType.GLOBAL]: {
    issues: IWorkspaceIssues;
    issuesFilter: IWorkspaceIssuesFilter;
  };
  [EIssuesStoreType.WORKSPACE_DRAFT]: {
    issues: IWorkspaceDraftIssues;
    issuesFilter: IWorkspaceDraftIssuesFilter;
  };
  [EIssuesStoreType.PROFILE]: {
    issues: IProfileIssues;
    issuesFilter: IProfileIssuesFilter;
  };
  [EIssuesStoreType.TEAM]: {
    issues: ITeamIssues;
    issuesFilter: ITeamIssuesFilter;
  };
  [EIssuesStoreType.PROJECT]: {
    issues: IProjectIssues;
    issuesFilter: IProjectIssuesFilter;
  };
  [EIssuesStoreType.CYCLE]: {
    issues: ICycleIssues;
    issuesFilter: ICycleIssuesFilter;
  };
  [EIssuesStoreType.MODULE]: {
    issues: IModuleIssues;
    issuesFilter: IModuleIssuesFilter;
  };
  [EIssuesStoreType.TEAM_VIEW]: {
    issues: ITeamViewIssues;
    issuesFilter: ITeamViewIssuesFilter;
  };
  [EIssuesStoreType.PROJECT_VIEW]: {
    issues: IProjectViewIssues;
    issuesFilter: IProjectViewIssuesFilter;
  };
  [EIssuesStoreType.ARCHIVED]: {
    issues: IArchivedIssues;
    issuesFilter: IArchivedIssuesFilter;
  };
  [EIssuesStoreType.DEFAULT]: {
    issues: IProjectIssues;
    issuesFilter: IProjectIssuesFilter;
  };
  [EIssuesStoreType.EPIC]: {
    issues: IProjectEpics;
    issuesFilter: IProjectEpicsFilter;
  };
  [EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS]: {
    issues: ITeamProjectWorkItems;
    issuesFilter: ITeamProjectWorkItemsFilter;
  };
};

export const useIssues = <T extends EIssuesStoreType>(storeType?: T): TStoreIssues[T] => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useIssues must be used within StoreProvider");

  switch (storeType) {
    case EIssuesStoreType.GLOBAL:
      return {
        issues: context.issue.workspaceIssues,
        issuesFilter: context.issue.workspaceIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.WORKSPACE_DRAFT:
      return {
        issues: context.issue.workspaceDraftIssues,
        issuesFilter: context.issue.workspaceDraftIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.PROFILE:
      return {
        issues: context.issue.profileIssues,
        issuesFilter: context.issue.profileIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.TEAM:
      return {
        issues: context.issue.teamIssues,
        issuesFilter: context.issue.teamIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.PROJECT:
      return {
        issues: context.issue.projectIssues,
        issuesFilter: context.issue.projectIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.CYCLE:
      return {
        issues: context.issue.cycleIssues,
        issuesFilter: context.issue.cycleIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.MODULE:
      return {
        issues: context.issue.moduleIssues,
        issuesFilter: context.issue.moduleIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.TEAM_VIEW:
      return {
        issues: context.issue.teamViewIssues,
        issuesFilter: context.issue.teamViewIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.PROJECT_VIEW:
      return {
        issues: context.issue.projectViewIssues,
        issuesFilter: context.issue.projectViewIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.ARCHIVED:
      return {
        issues: context.issue.archivedIssues,
        issuesFilter: context.issue.archivedIssuesFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.EPIC:
      return {
        issues: context.issue.projectEpics,
        issuesFilter: context.issue.projectEpicsFilter,
      } as TStoreIssues[T];
    case EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS:
      return {
        issues: context.issue.teamProjectWorkItems,
        issuesFilter: context.issue.teamProjectWorkItemsFilter,
      } as TStoreIssues[T];
    default:
      return {
        issues: context.issue.projectIssues,
        issuesFilter: context.issue.projectIssuesFilter,
      } as TStoreIssues[T];
  }
};

/**
 * Subscribe to a single work item. Prefer this in leaf observers instead of
 * reading `issuesMap`, which notifies every board card on any issue change.
 */
export const useIssueById = (issueId: string | undefined | null): TIssue | undefined => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useIssueById must be used within StoreProvider");
  if (!issueId) return undefined;
  return context.issue.issues.getIssueById(issueId);
};
