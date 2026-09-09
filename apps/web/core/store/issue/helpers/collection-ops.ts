/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import { EDraftIssuePaginationType, EIssueFilterType } from "@plane/constants";
import type {
  EIssueLayoutTypes,
  IssuePaginationOptions,
  TIssue,
  TIssuesResponse,
  TLoader,
  TProfileViews,
  TSupportedFilterForUpdate,
  TWorkItemFilterExpression,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import type { TStoreIssues } from "@/hooks/store/use-issues";
import type { IArchivedIssues, IArchivedIssuesFilter } from "@/store/issue/archived";
import type { ICycleIssues, ICycleIssuesFilter } from "@/store/issue/cycle";
import type { IModuleIssues, IModuleIssuesFilter } from "@/store/issue/module";
import type { IProfileIssues, IProfileIssuesFilter } from "@/store/issue/profile";
import type { IProjectIssues, IProjectIssuesFilter } from "@/store/issue/project";
import type { IProjectViewIssues, IProjectViewIssuesFilter } from "@/store/issue/project-views";
import type { IWorkspaceIssues, IWorkspaceIssuesFilter } from "@/store/issue/workspace";
import type { IWorkspaceDraftIssues, IWorkspaceDraftIssuesFilter } from "@/store/issue/workspace-draft";
import type { TCollectionRef, TIssueRouteIds } from "./collection-ref";
import { resolveCollectionRef } from "./collection-ref";

export type { TIssueRouteIds };

export type TCollectionOps = {
  ref: TCollectionRef | undefined;
  hydrateFilters: (ref: TCollectionRef) => void;
  fetchFilters: (ref: TCollectionRef) => Promise<void>;
  updateFilterExpression: (ref: TCollectionRef, filters: TWorkItemFilterExpression) => Promise<void> | void;
  persistLayout: (ref: TCollectionRef, layout: EIssueLayoutTypes) => void;
  fetchIssues: (
    loadType: TLoader,
    options: IssuePaginationOptions,
    viewId?: string
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (groupId?: string, subGroupId?: string) => Promise<TIssuesResponse | undefined>;
  createIssue?: (projectId: string, data: Partial<TIssue>) => Promise<TIssue | undefined>;
  quickAddIssue?: (projectId: string, data: TIssue) => Promise<TIssue | undefined>;
  updateIssue?: (projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  removeIssue?: (projectId: string | undefined | null, issueId: string) => Promise<void>;
  removeIssueFromView?: (projectId: string, issueId: string) => Promise<void>;
  archiveIssue?: (projectId: string, issueId: string) => Promise<void>;
  restoreIssue?: (projectId: string, issueId: string) => Promise<void>;
  updateFilters: (
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate
  ) => Promise<void>;
};

type TIssuesUnion = TStoreIssues[EIssuesStoreType]["issues"];
type TFiltersUnion = TStoreIssues[EIssuesStoreType]["issuesFilter"];

export function bindCollectionOps(
  storeType: EIssuesStoreType,
  issues: TIssuesUnion,
  issuesFilter: TFiltersUnion,
  ids: TIssueRouteIds
): TCollectionOps {
  const workspaceSlug = ids.workspaceSlug;
  const projectFilters = issuesFilter as IProjectIssuesFilter;
  const archivedFilters = issuesFilter as IArchivedIssuesFilter;
  const cycleFilters = issuesFilter as ICycleIssuesFilter;
  const moduleFilters = issuesFilter as IModuleIssuesFilter;
  const viewFilters = issuesFilter as IProjectViewIssuesFilter;

  const hydrateFilters = (ref: TCollectionRef) => {
    if (storeType === EIssuesStoreType.ARCHIVED) return;
    if (storeType === EIssuesStoreType.PROJECT) {
      projectFilters.hydrateFilters(ref.workspaceSlug, ref.entityId);
      return;
    }
    if (storeType === EIssuesStoreType.PROJECT_VIEW) {
      viewFilters.hydrateFilters(ref.workspaceSlug, ref.entityId);
      return;
    }
    if (!ref.projectId) return;
    if (storeType === EIssuesStoreType.CYCLE) {
      cycleFilters.hydrateFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
      return;
    }
    if (storeType === EIssuesStoreType.MODULE) {
      moduleFilters.hydrateFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
    }
  };

  const fetchFilters = async (ref: TCollectionRef) => {
    if (storeType === EIssuesStoreType.ARCHIVED) {
      await archivedFilters.fetchFilters(ref.workspaceSlug, ref.entityId);
      return;
    }
    if (storeType === EIssuesStoreType.PROJECT) {
      await projectFilters.fetchFilters(ref.workspaceSlug, ref.entityId);
      return;
    }
    if (!ref.projectId) return;
    if (storeType === EIssuesStoreType.PROJECT_VIEW) {
      await viewFilters.fetchFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
      return;
    }
    if (storeType === EIssuesStoreType.CYCLE) {
      await cycleFilters.fetchFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
      return;
    }
    if (storeType === EIssuesStoreType.MODULE) {
      await moduleFilters.fetchFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
    }
  };

  const updateFilterExpression = (ref: TCollectionRef, filters: TWorkItemFilterExpression) => {
    if (storeType === EIssuesStoreType.ARCHIVED) {
      return archivedFilters.updateFilterExpression(ref.workspaceSlug, ref.entityId, filters);
    }
    if (storeType === EIssuesStoreType.PROJECT) {
      return projectFilters.updateFilterExpression(ref.workspaceSlug, ref.entityId, filters);
    }
    if (!ref.projectId) return;
    if (storeType === EIssuesStoreType.PROJECT_VIEW) {
      return viewFilters.updateFilterExpression(ref.workspaceSlug, ref.projectId, ref.entityId, filters);
    }
    if (storeType === EIssuesStoreType.CYCLE) {
      return cycleFilters.updateFilterExpression(ref.workspaceSlug, ref.projectId, ref.entityId, filters);
    }
    if (storeType === EIssuesStoreType.MODULE) {
      return moduleFilters.updateFilterExpression(ref.workspaceSlug, ref.projectId, ref.entityId, filters);
    }
  };

  const persistLayout = (ref: TCollectionRef, layout: EIssueLayoutTypes) => {
    if (!ref.projectId) return;
    const patch = { layout };
    if (storeType === EIssuesStoreType.CYCLE) {
      void cycleFilters.updateFilters(
        ref.workspaceSlug,
        ref.projectId,
        EIssueFilterType.DISPLAY_FILTERS,
        patch,
        ref.entityId
      );
      return;
    }
    if (storeType === EIssuesStoreType.MODULE) {
      void moduleFilters.updateFilters(
        ref.workspaceSlug,
        ref.projectId,
        EIssueFilterType.DISPLAY_FILTERS,
        patch,
        ref.entityId
      );
      return;
    }
    if (storeType === EIssuesStoreType.PROJECT_VIEW) {
      void viewFilters.updateFilters(
        ref.workspaceSlug,
        ref.projectId,
        EIssueFilterType.DISPLAY_FILTERS,
        patch,
        ref.entityId
      );
      return;
    }
    void projectFilters.updateFilters(ref.workspaceSlug, ref.projectId, EIssueFilterType.DISPLAY_FILTERS, patch);
  };

  const fetchIssues: TCollectionOps["fetchIssues"] = async (loadType, options, viewId) => {
    if (!workspaceSlug) return undefined;
    switch (storeType) {
      case EIssuesStoreType.PROJECT_VIEW: {
        const resolvedViewId = viewId ?? ids.viewId;
        if (!ids.projectId || !resolvedViewId) return undefined;
        return (issues as IProjectViewIssues).fetchIssues(
          workspaceSlug,
          ids.projectId,
          resolvedViewId,
          loadType,
          options
        );
      }
      case EIssuesStoreType.CYCLE: {
        const resolvedCycleId = viewId ?? ids.cycleId;
        if (!ids.projectId || !resolvedCycleId) return undefined;
        return (issues as ICycleIssues).fetchIssues(workspaceSlug, ids.projectId, loadType, options, resolvedCycleId);
      }
      case EIssuesStoreType.MODULE: {
        const resolvedModuleId = viewId ?? ids.moduleId;
        if (!ids.projectId || !resolvedModuleId) return undefined;
        return (issues as IModuleIssues).fetchIssues(workspaceSlug, ids.projectId, loadType, options, resolvedModuleId);
      }
      case EIssuesStoreType.PROFILE: {
        if (!ids.userId || !viewId) return undefined;
        return (issues as IProfileIssues).fetchIssues(
          workspaceSlug,
          ids.userId,
          loadType,
          options,
          viewId as TProfileViews
        );
      }
      case EIssuesStoreType.GLOBAL: {
        if (!ids.globalViewId) return undefined;
        return (issues as IWorkspaceIssues).fetchIssues(workspaceSlug, ids.globalViewId, loadType, options);
      }
      case EIssuesStoreType.WORKSPACE_DRAFT:
        await (issues as IWorkspaceDraftIssues).fetchIssues(workspaceSlug, loadType, EDraftIssuePaginationType.INIT);
        return undefined;
      default: {
        if (!ids.projectId) return undefined;
        return (issues as IProjectIssues).fetchIssues(workspaceSlug, ids.projectId, loadType, options);
      }
    }
  };

  const fetchNextIssues: TCollectionOps["fetchNextIssues"] = async (groupId, subGroupId) => {
    if (!workspaceSlug) return undefined;
    switch (storeType) {
      case EIssuesStoreType.PROJECT_VIEW:
        if (!ids.projectId || !ids.viewId) return undefined;
        return (issues as IProjectViewIssues).fetchNextIssues(
          workspaceSlug,
          ids.projectId,
          ids.viewId,
          groupId,
          subGroupId
        );
      case EIssuesStoreType.CYCLE:
        if (!ids.projectId || !ids.cycleId) return undefined;
        return (issues as ICycleIssues).fetchNextIssues(workspaceSlug, ids.projectId, ids.cycleId, groupId, subGroupId);
      case EIssuesStoreType.MODULE:
        if (!ids.projectId || !ids.moduleId) return undefined;
        return (issues as IModuleIssues).fetchNextIssues(
          workspaceSlug,
          ids.projectId,
          ids.moduleId,
          groupId,
          subGroupId
        );
      case EIssuesStoreType.PROFILE:
        if (!ids.userId) return undefined;
        return (issues as IProfileIssues).fetchNextIssues(workspaceSlug, ids.userId, groupId, subGroupId);
      case EIssuesStoreType.GLOBAL:
        if (!ids.globalViewId) return undefined;
        return (issues as IWorkspaceIssues).fetchNextIssues(workspaceSlug, ids.globalViewId, groupId, subGroupId);
      case EIssuesStoreType.WORKSPACE_DRAFT:
        await (issues as IWorkspaceDraftIssues).fetchIssues(
          workspaceSlug,
          "pagination",
          EDraftIssuePaginationType.NEXT
        );
        return undefined;
      default:
        if (!ids.projectId) return undefined;
        return (issues as IProjectIssues).fetchNextIssues(workspaceSlug, ids.projectId, groupId, subGroupId);
    }
  };

  const updateFilters: TCollectionOps["updateFilters"] = async (projectId, filterType, filters) => {
    if (!workspaceSlug) return;
    switch (storeType) {
      case EIssuesStoreType.CYCLE:
        if (!ids.cycleId) return;
        return cycleFilters.updateFilters(workspaceSlug, projectId, filterType, filters, ids.cycleId);
      case EIssuesStoreType.MODULE:
        if (!ids.moduleId) return;
        return moduleFilters.updateFilters(workspaceSlug, projectId, filterType, filters, ids.moduleId);
      case EIssuesStoreType.PROJECT_VIEW:
        if (!ids.viewId) return;
        return viewFilters.updateFilters(workspaceSlug, projectId, filterType, filters, ids.viewId);
      case EIssuesStoreType.PROFILE:
        if (!ids.userId) return;
        return (issuesFilter as IProfileIssuesFilter).updateFilters(
          workspaceSlug,
          projectId,
          filterType,
          filters,
          ids.userId
        );
      case EIssuesStoreType.GLOBAL:
        if (!ids.globalViewId) return;
        return (issuesFilter as IWorkspaceIssuesFilter).updateFilters(
          workspaceSlug,
          projectId,
          filterType,
          filters,
          ids.globalViewId
        );
      case EIssuesStoreType.WORKSPACE_DRAFT:
        return (issuesFilter as IWorkspaceDraftIssuesFilter).updateFilters(workspaceSlug, filterType, filters);
      default:
        return projectFilters.updateFilters(workspaceSlug, projectId, filterType, filters);
    }
  };

  const collection: TCollectionOps = {
    ref: resolveCollectionRef(storeType, ids),
    hydrateFilters,
    fetchFilters,
    updateFilterExpression,
    persistLayout,
    fetchIssues,
    fetchNextIssues,
    updateFilters,
  };

  const projectIssues = issues as IProjectIssues;
  const cycleIssues = issues as ICycleIssues;
  const moduleIssues = issues as IModuleIssues;
  const draftIssues = issues as IWorkspaceDraftIssues;

  if (storeType === EIssuesStoreType.WORKSPACE_DRAFT) {
    collection.createIssue = async (_projectId, data) => {
      if (!workspaceSlug) return undefined;
      return (await draftIssues.createIssue(workspaceSlug, data)) as TIssue | undefined;
    };
    collection.updateIssue = async (_projectId, issueId, data) => {
      if (!workspaceSlug) return;
      await draftIssues.updateIssue(workspaceSlug, issueId, data);
    };
    collection.removeIssue = async (_projectId, issueId) => {
      await draftIssues.removeIssue(issueId);
    };
    return collection;
  }

  if ("createIssue" in issues && typeof projectIssues.createIssue === "function") {
    collection.createIssue = async (projectId, data) => {
      if (!workspaceSlug) return undefined;
      if (storeType === EIssuesStoreType.CYCLE && ids.cycleId) {
        return cycleIssues.createIssue(workspaceSlug, projectId, data, ids.cycleId);
      }
      if (storeType === EIssuesStoreType.MODULE && ids.moduleId) {
        return moduleIssues.createIssue(workspaceSlug, projectId, data, ids.moduleId);
      }
      return projectIssues.createIssue(workspaceSlug, projectId, data);
    };
  }

  if ("quickAddIssue" in issues && typeof projectIssues.quickAddIssue === "function") {
    collection.quickAddIssue = async (projectId, data) => {
      if (!workspaceSlug) return undefined;
      if (storeType === EIssuesStoreType.CYCLE && ids.cycleId) {
        return cycleIssues.quickAddIssue(workspaceSlug, projectId, data, ids.cycleId);
      }
      if (storeType === EIssuesStoreType.MODULE && ids.moduleId) {
        return moduleIssues.quickAddIssue(workspaceSlug, projectId, data, ids.moduleId);
      }
      return projectIssues.quickAddIssue(workspaceSlug, projectId, data);
    };
  }

  if ("updateIssue" in issues && typeof projectIssues.updateIssue === "function") {
    collection.updateIssue = async (projectId, issueId, data) => {
      if (!workspaceSlug) return;
      return projectIssues.updateIssue(workspaceSlug, projectId, issueId, data);
    };
  }

  if ("removeIssue" in issues && typeof projectIssues.removeIssue === "function") {
    collection.removeIssue = async (projectId, issueId) => {
      if (!workspaceSlug || !projectId) return;
      return projectIssues.removeIssue(workspaceSlug, projectId, issueId);
    };
  }

  if (storeType === EIssuesStoreType.CYCLE && ids.cycleId && "removeIssueFromCycle" in cycleIssues) {
    collection.removeIssueFromView = async (projectId, issueId) => {
      if (!workspaceSlug) return;
      return cycleIssues.removeIssueFromCycle(workspaceSlug, projectId, ids.cycleId as string, issueId);
    };
  }

  if (storeType === EIssuesStoreType.MODULE && ids.moduleId && "removeIssuesFromModule" in moduleIssues) {
    collection.removeIssueFromView = async (projectId, issueId) => {
      if (!workspaceSlug) return;
      return moduleIssues.removeIssuesFromModule(workspaceSlug, projectId, ids.moduleId as string, [issueId]);
    };
  }

  if ("archiveIssue" in issues && typeof projectIssues.archiveIssue === "function") {
    collection.archiveIssue = async (projectId, issueId) => {
      if (!workspaceSlug) return;
      return projectIssues.archiveIssue(workspaceSlug, projectId, issueId);
    };
  }

  if (storeType === EIssuesStoreType.ARCHIVED) {
    collection.restoreIssue = async (projectId, issueId) => {
      if (!workspaceSlug) return;
      return (issues as IArchivedIssues).restoreIssue(workspaceSlug, projectId, issueId);
    };
  }

  return collection;
}
