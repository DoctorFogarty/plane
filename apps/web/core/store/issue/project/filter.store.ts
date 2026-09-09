/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
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
import type { TCollectionRef } from "../helpers/collection-ref";
import { EntityIssuesFilter } from "../helpers/entity-issues-filter";
import type { IBaseIssueFilterStore, TFilterPropertySource } from "../helpers/issue-filter-helper.store";
import type { IIssueRootStore } from "../root.store";

export interface IProjectIssuesFilter extends IBaseIssueFilterStore {
  getFilterParams: (
    options: IssuePaginationOptions,
    projectId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(projectId: string): IIssueFilters | undefined;
  pruneCustomDisplayProperties: (projectId: string, allowedPropertyIds: Iterable<string>) => void;
  hydrateFilters: (workspaceSlug: string, projectId: string) => void;
  fetchFilters: (workspaceSlug: string, projectId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate
  ) => Promise<void>;
}

export class ProjectIssuesFilter extends EntityIssuesFilter implements IProjectIssuesFilter {
  readonly scope = { storeType: EIssuesStoreType.PROJECT };

  constructor(_rootStore: IIssueRootStore) {
    super(_rootStore);
    makeObservable(this, {
      filters: observable,
      issueFilters: computed,
      appliedFilters: computed,
      fetchFilters: action,
      hydrateFilters: action,
      pruneCustomDisplayProperties: action,
      updateFilterExpression: action,
      updateFilters: action,
    });
  }

  routerEntityId = () => this.rootIssueStore.projectId;

  hydrateFrom = (ref: TCollectionRef): TFilterPropertySource =>
    this.rootIssueStore.rootStore.memberRoot.project.getProjectUserProperties(ref.entityId);

  fetchRemote = (ref: TCollectionRef) =>
    this.rootIssueStore.rootStore.memberRoot.project.fetchProjectUserProperties(ref.workspaceSlug, ref.entityId);

  persist = (ref: TCollectionRef, payload: Record<string, unknown>) =>
    this.rootIssueStore.rootStore.memberRoot.project.updateProjectUserProperties(
      ref.workspaceSlug,
      ref.entityId,
      payload
    );

  refetchIssues = (ref: TCollectionRef) => {
    this.rootIssueStore.projectIssues.fetchIssuesWithExistingPagination(ref.workspaceSlug, ref.entityId, "mutation");
  };

  clearIssues = () => this.rootIssueStore.projectIssues.clear(true);

  pruneCustomDisplayProperties = (projectId: string, allowedPropertyIds: Iterable<string>) => {
    const currentCustomProperties = this.filters[projectId]?.displayProperties?.custom_properties;
    if (!currentCustomProperties) return;

    const allowedPropertyIdSet = allowedPropertyIds instanceof Set ? allowedPropertyIds : new Set(allowedPropertyIds);
    const nextCustomProperties = Object.fromEntries(
      Object.entries(currentCustomProperties).filter(([propertyId]) => allowedPropertyIdSet.has(propertyId))
    );
    if (Object.keys(nextCustomProperties).length === Object.keys(currentCustomProperties).length) return;

    set(this.filters, [projectId, "displayProperties", "custom_properties"], nextCustomProperties);
  };

  hydrateFilters = (workspaceSlug: string, projectId: string) =>
    this.hydrateRef({ workspaceSlug, projectId, entityId: projectId });

  fetchFilters = async (workspaceSlug: string, projectId: string) =>
    this.fetchRef({ workspaceSlug, projectId, entityId: projectId });

  updateFilterExpression: IProjectIssuesFilter["updateFilterExpression"] = async (
    workspaceSlug,
    projectId,
    filters
  ) => {
    try {
      await this.updateExpressionRef({ workspaceSlug, projectId, entityId: projectId }, filters);
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: IProjectIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters) => {
    try {
      await this.updateFiltersRef({ workspaceSlug, projectId, entityId: projectId }, type, filters);
    } catch (error) {
      this.fetchFilters(workspaceSlug, projectId);
      throw error;
    }
  };
}
