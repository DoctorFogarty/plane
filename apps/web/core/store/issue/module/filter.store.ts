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

export interface IModuleIssuesFilter extends IBaseIssueFilterStore {
  getFilterParams: (
    options: IssuePaginationOptions,
    moduleId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(moduleId: string): IIssueFilters | undefined;
  hydrateFilters: (workspaceSlug: string, projectId: string, moduleId: string) => void;
  fetchFilters: (workspaceSlug: string, projectId: string, moduleId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate,
    moduleId: string
  ) => Promise<void>;
}

export class ModuleIssuesFilter extends EntityIssuesFilter implements IModuleIssuesFilter {
  readonly scope = { storeType: EIssuesStoreType.MODULE, extraQueryParam: "module" as const };
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

  routerEntityId = () => this.rootIssueStore.moduleId;

  hydrateFrom = (ref: TCollectionRef) =>
    ref.projectId ? this.rootIssueStore.projectIssuesFilter.getIssueFilters(ref.projectId) : undefined;

  fetchRemote = (ref: TCollectionRef) => {
    if (!ref.projectId) return Promise.resolve(undefined);
    return this.issueFilterService.fetchModuleIssueFilters(ref.workspaceSlug, ref.projectId, ref.entityId);
  };

  persist = (ref: TCollectionRef, payload: Record<string, unknown>) => {
    if (!ref.projectId) return Promise.resolve();
    return this.issueFilterService.patchModuleIssueFilters(ref.workspaceSlug, ref.projectId, ref.entityId, payload);
  };

  refetchIssues = (ref: TCollectionRef) => {
    if (!ref.projectId) return;
    this.rootIssueStore.moduleIssues.fetchIssuesWithExistingPagination(
      ref.workspaceSlug,
      ref.projectId,
      "mutation",
      ref.entityId
    );
  };

  clearIssues = () => this.rootIssueStore.moduleIssues.clear(true);

  hydrateFilters = (workspaceSlug: string, projectId: string, moduleId: string) =>
    this.hydrateRef({ workspaceSlug, projectId, entityId: moduleId });

  fetchFilters = async (workspaceSlug: string, projectId: string, moduleId: string) =>
    this.fetchRef({ workspaceSlug, projectId, entityId: moduleId });

  updateFilterExpression: IModuleIssuesFilter["updateFilterExpression"] = async (
    workspaceSlug,
    projectId,
    moduleId,
    filters
  ) => {
    try {
      await this.updateExpressionRef({ workspaceSlug, projectId, entityId: moduleId }, filters);
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: IModuleIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters, moduleId) => {
    try {
      await this.updateFiltersRef({ workspaceSlug, projectId, entityId: moduleId }, type, filters);
    } catch (error) {
      if (moduleId) this.fetchFilters(workspaceSlug, projectId, moduleId);
      throw error;
    }
  };
}
