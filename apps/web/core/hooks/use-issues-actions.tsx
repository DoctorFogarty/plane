/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams } from "react-router";
import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import type { IssuePaginationOptions, TIssue, TIssuesResponse, TLoader, TSupportedFilterForUpdate } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { bindCollectionOps } from "@/store/issue/helpers/collection-ops";
import { useIssues } from "./store/use-issues";

export interface IssueActions {
  fetchIssues: (
    loadType: TLoader,
    options: IssuePaginationOptions,
    viewId?: string
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (groupId?: string, subGroupId?: string) => Promise<TIssuesResponse | undefined>;
  removeIssue: (projectId: string | undefined | null, issueId: string) => Promise<void>;
  createIssue?: (projectId: string | undefined | null, data: Partial<TIssue>) => Promise<TIssue | undefined>;
  quickAddIssue?: (projectId: string | undefined | null, data: TIssue) => Promise<TIssue | undefined>;
  updateIssue?: (projectId: string | undefined | null, issueId: string, data: Partial<TIssue>) => Promise<void>;
  removeIssueFromView?: (projectId: string | undefined | null, issueId: string) => Promise<void>;
  archiveIssue?: (projectId: string | undefined | null, issueId: string) => Promise<void>;
  restoreIssue?: (projectId: string | undefined | null, issueId: string) => Promise<void>;
  updateFilters: (
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate
  ) => Promise<void>;
}

export const useIssuesActions = (storeType: EIssuesStoreType): IssueActions => {
  const params = useParams();
  const ids = useMemo(
    () => ({
      workspaceSlug: params.workspaceSlug,
      projectId: params.projectId,
      cycleId: params.cycleId,
      moduleId: params.moduleId,
      viewId: params.viewId,
      userId: params.userId,
      globalViewId: params.globalViewId,
    }),
    [
      params.cycleId,
      params.globalViewId,
      params.moduleId,
      params.projectId,
      params.userId,
      params.viewId,
      params.workspaceSlug,
    ]
  );

  const { issues, issuesFilter } = useIssues(storeType);

  return useMemo(() => {
    const collection = bindCollectionOps(storeType, issues, issuesFilter, ids);
    const actions: IssueActions = {
      fetchIssues: collection.fetchIssues,
      fetchNextIssues: collection.fetchNextIssues,
      removeIssue: async (projectId, issueId) => {
        if (!collection.removeIssue) return;
        return collection.removeIssue(projectId, issueId);
      },
      updateFilters: collection.updateFilters,
    };
    if (collection.createIssue) {
      actions.createIssue = async (projectId, data) => {
        if (!projectId) return undefined;
        return collection.createIssue?.(projectId, data);
      };
    }
    if (collection.quickAddIssue) {
      actions.quickAddIssue = async (projectId, data) => {
        if (!projectId) return undefined;
        return collection.quickAddIssue?.(projectId, data);
      };
    }
    if (collection.updateIssue) {
      actions.updateIssue = async (projectId, issueId, data) => {
        if (!projectId) return;
        return collection.updateIssue?.(projectId, issueId, data);
      };
    }
    if (collection.removeIssueFromView) {
      actions.removeIssueFromView = async (projectId, issueId) => {
        if (!projectId) return;
        return collection.removeIssueFromView?.(projectId, issueId);
      };
    }
    if (collection.archiveIssue) {
      actions.archiveIssue = async (projectId, issueId) => {
        if (!projectId) return;
        return collection.archiveIssue?.(projectId, issueId);
      };
    }
    if (collection.restoreIssue) {
      actions.restoreIssue = async (projectId, issueId) => {
        if (!projectId) return;
        return collection.restoreIssue?.(projectId, issueId);
      };
    }
    return actions;
  }, [ids, issues, issuesFilter, storeType]);
};
