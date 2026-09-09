/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable } from "mobx";
import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import type {
  IIssueFilters,
  TIssueParams,
  IssuePaginationOptions,
  TWorkItemFilterExpression,
  TSupportedFilterForUpdate,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { IssueFiltersService } from "@/services/issue_filter.service";
import type { TCollectionRef } from "../helpers/collection-ref";
import { EntityIssuesFilter } from "../helpers/entity-issues-filter";
import type { IBaseIssueFilterStore } from "../helpers/issue-filter-helper.store";
import type { IIssueRootStore } from "../root.store";

export interface ICycleIssuesFilter extends IBaseIssueFilterStore {
  getFilterParams: (
    options: IssuePaginationOptions,
    cycleId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(cycleId: string): IIssueFilters | undefined;
  hydrateFilters: (workspaceSlug: string, projectId: string, cycleId: string) => void;
  fetchFilters: (workspaceSlug: string, projectId: string, cycleId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate,
    cycleId: string
  ) => Promise<void>;
}

export class CycleIssuesFilter extends EntityIssuesFilter implements ICycleIssuesFilter {
  readonly scope = { storeType: EIssuesStoreType.CYCLE, extraQueryParam: "cycle" as const };
  issueFilterService;

  constructor(_rootStore: IIssueRootStore) {
    super(_rootStore);
    makeObservable(this, {
      filters: observable,
      issueFilters: computed,
      appliedFilters: computed,
      fetchFilters: action,
      hydrateFilters: action,
      updateFilters: action,
    });
    this.issueFilterService = new IssueFiltersService();
  }

  routerEntityId = () => this.rootIssueStore.cycleId;

  hydrateFrom = (ref: TCollectionRef) =>
    ref.projectId ? this.rootIssueStore.projectIssuesFilter.getIssueFilters(ref.projectId) : undefined;

  fetchRemote = (ref: TCollectionRef) => {
    if (!ref.projectId) return Promise.resolve(undefined);
    return this.issueFilterService.fetchCycleIssueFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
  };

  persist = (ref: TCollectionRef, payload: Record<string, unknown>) => {
    if (!ref.projectId) return Promise.resolve();
    return this.issueFilterService.patchCycleIssueFilters(ref.workspaceSlug, ref.projectId, ref.entityId, payload);
  };

  refetchIssues = (ref: TCollectionRef) => {
    if (!ref.projectId) return;
    this.rootIssueStore.cycleIssues.fetchIssuesWithExistingPagination(
      ref.workspaceSlug,
      ref.projectId,
      "mutation",
      ref.entityId
    );
  };

  clearIssues = () => this.rootIssueStore.cycleIssues.clear(true);

  hydrateFilters = (workspaceSlug: string, projectId: string, cycleId: string) =>
    this.hydrateRef({ workspaceSlug, projectId, entityId: cycleId });

  fetchFilters = async (workspaceSlug: string, projectId: string, cycleId: string) =>
    this.fetchRef({ workspaceSlug, projectId, entityId: cycleId });

  updateFilterExpression: ICycleIssuesFilter["updateFilterExpression"] = async (
    workspaceSlug,
    projectId,
    cycleId,
    filters
  ) => {
    try {
      await this.updateExpressionRef({ workspaceSlug, projectId, entityId: cycleId }, filters);
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: ICycleIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters, cycleId) => {
    try {
      await this.updateFiltersRef({ workspaceSlug, projectId, entityId: cycleId }, type, filters);
    } catch (error) {
      if (cycleId) this.fetchFilters(workspaceSlug, projectId, cycleId);
      throw error;
    }
  };
}
