/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { action, makeObservable } from "mobx";
// types
import type {
  TIssue,
  TLoader,
  ViewFlags,
  IssuePaginationOptions,
  TIssuesResponse,
  TBulkOperationsPayload,
} from "@plane/types";
// helpers
// base class
import type { IBaseIssuesStore } from "../helpers/base-issues.store";
import { BaseIssuesStore } from "../helpers/base-issues.store";
import { issueListRequestKey } from "../helpers/collection-ref";
import { consumePrefetch, runPrefetch } from "@/lib/prefetch-registry";
// services
import type { IIssueRootStore } from "../root.store";
import type { IProjectIssuesFilter } from "./filter.store";

export interface IProjectIssues extends IBaseIssuesStore {
  viewFlags: ViewFlags;
  // action
  prefetchIssues: (workspaceSlug: string, projectId: string, option: IssuePaginationOptions) => void;
  fetchIssues: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader,
    option: IssuePaginationOptions
  ) => Promise<TIssuesResponse | undefined>;
  fetchIssuesWithExistingPagination: (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader
  ) => Promise<TIssuesResponse | undefined>;
  fetchNextIssues: (
    workspaceSlug: string,
    projectId: string,
    groupId?: string,
    subGroupId?: string
  ) => Promise<TIssuesResponse | undefined>;

  createIssue: (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => Promise<TIssue>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  archiveIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  quickAddIssue: (workspaceSlug: string, projectId: string, data: TIssue) => Promise<TIssue | undefined>;
  removeBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  archiveBulkIssues: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  bulkUpdateProperties: (workspaceSlug: string, projectId: string, data: TBulkOperationsPayload) => Promise<void>;
}

export class ProjectIssues extends BaseIssuesStore implements IProjectIssues {
  viewFlags = {
    enableQuickAdd: true,
    enableIssueCreation: true,
    enableInlineEditing: true,
  };
  router;

  // filter store
  issueFilterStore: IProjectIssuesFilter;

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IProjectIssuesFilter) {
    super(_rootStore, issueFilterStore);
    makeObservable(this, {
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,

      quickAddIssue: action,
    });
    // filter store
    this.issueFilterStore = issueFilterStore;
    this.router = _rootStore.rootStore.router;
  }

  /**
   * Fetches the project details
   * @param workspaceSlug
   * @param projectId
   */
  fetchParentStats = async (workspaceSlug: string, projectId?: string) => {
    if (projectId) this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
  };

  /** */
  updateParentStats = () => {};

  /**
   * Speculatively request the first page for a project the user is about to
   * open (sidebar hover/focus). Touches no store state; `fetchIssues` picks the
   * response up through the prefetch registry when the layout mounts with the
   * same filters, so the navigation does not wait on a fresh round trip.
   * Requires the destination's filters to be hydrated so the request identity
   * matches what the layout will ask for.
   */
  prefetchIssues = (workspaceSlug: string, projectId: string, options: IssuePaginationOptions) => {
    if (!this.issueFilterStore?.getIssueFilters(projectId)) return;
    const params = this.issueFilterStore.getFilterParams(options, projectId, undefined, undefined, undefined);
    const requestKey = issueListRequestKey({ workspaceSlug, projectId, params });
    if (this.fetchPromises.has(requestKey)) return;
    runPrefetch(requestKey, () => this.issueService.getIssues(workspaceSlug, projectId, params)).catch(() => undefined);
  };

  /**
   * This method is called to fetch the first issues of pagination
   * @param workspaceSlug
   * @param projectId
   * @param loadType
   * @param options
   * @returns
   */
  fetchIssues = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader = "init-loader",
    options: IssuePaginationOptions,
    isExistingPaginationOptions: boolean = false
  ) => {
    // Compute the request identity before clearing the store. Concurrent mounts
    // with identical filters should share one request instead of aborting and
    // restarting each other.
    const params = this.issueFilterStore?.getFilterParams(options, projectId, undefined, undefined, undefined);
    const requestKey = issueListRequestKey({ workspaceSlug, projectId, params });
    try {
      return await this.fetchIssuesWithDedupe(requestKey, loadType, !isExistingPaginationOptions, async () => {
        const response = await consumePrefetch(requestKey, () =>
          this.issueService.getIssues(workspaceSlug, projectId, params, {
            signal: this.controller.signal,
          })
        );
        this.onfetchIssues(response, options, workspaceSlug, projectId, undefined, !isExistingPaginationOptions, false);
        return response;
      });
    } catch (error) {
      this.setLoader(undefined);
      throw error;
    }
  };

  /**
   * This method is called subsequent pages of pagination
   * if groupId/subgroupId is provided, only that specific group's next page is fetched
   * else all the groups' next page is fetched
   * @param workspaceSlug
   * @param projectId
   * @param groupId
   * @param subGroupId
   * @returns
   */
  fetchNextIssues = async (workspaceSlug: string, projectId: string, groupId?: string, subGroupId?: string) => {
    const cursorObject = this.getPaginationData(groupId, subGroupId);
    // if there are no pagination options and the next page results do not exist the return
    if (!this.paginationOptions || (cursorObject && !cursorObject?.nextPageResults)) return;
    try {
      // set Loader
      this.setLoader("pagination", groupId, subGroupId);

      // get params from stored pagination options
      const params = this.issueFilterStore?.getFilterParams(
        this.paginationOptions,
        projectId,
        this.getNextCursor(groupId, subGroupId),
        groupId,
        subGroupId
      );
      // call the fetch issues API with the params for next page in issues
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params);

      // after the next page of issues are fetched, call the base method to process the response
      this.onfetchNexIssues(response, groupId, subGroupId);
      return response;
    } catch (error) {
      // set Loader as undefined if errored out
      this.setLoader(undefined, groupId, subGroupId);
      throw error;
    }
  };

  /**
   * This Method exists to fetch the first page of the issues with the existing stored pagination
   * This is useful for refetching when filters, groupBy, orderBy etc changes
   * @param workspaceSlug
   * @param projectId
   * @param loadType
   * @returns
   */
  fetchIssuesWithExistingPagination = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader = "mutation"
  ) => {
    if (!this.paginationOptions) return;
    return await this.fetchIssues(workspaceSlug, projectId, loadType, this.paginationOptions, true);
  };

  /**
   * Override inherited create issue, to update list only if user is on current project
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns
   */
  override createIssue = async (workspaceSlug: string, projectId: string, data: Partial<TIssue>) => {
    const response = await super.createIssue(workspaceSlug, projectId, data, "", projectId === this.router.projectId);
    return response;
  };

  // Using aliased names as they cannot be overridden in other stores
  archiveBulkIssues = this.bulkArchiveIssues;
  quickAddIssue = this.issueQuickAdd;
  updateIssue = this.issueUpdate;
  archiveIssue = this.issueArchive;
}
