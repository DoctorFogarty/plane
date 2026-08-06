/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { runInAction, set } from "mobx";
import { concat } from "lodash-es";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, TIssue, TIssueGroupByOptions, TIssueOrderByOptions } from "@plane/types";
import { canNestUnder } from "@/components/issues/issue-layouts/hierarchy.helpers";
import type { GroupDropLocation } from "@/components/issues/issue-layouts/utils";
import { handleGroupDragDrop } from "@/components/issues/issue-layouts/utils";
import { ISSUE_FILTER_DEFAULT_DATA } from "@/store/issue/helpers/base-issues.store";
import { useIssueDetail } from "./store/use-issue-detail";
import { useIssueType } from "./store/use-issue-type";
import { useIssues } from "./store/use-issues";
import { useProject } from "./store/use-project";
import { useIssuesActions } from "./use-issues-actions";

type DNDStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC
  | EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS;

export const useGroupIssuesDragNDrop = (
  storeType: DNDStoreType,
  orderBy: TIssueOrderByOptions | undefined,
  groupBy: TIssueGroupByOptions | undefined,
  subGroupBy?: TIssueGroupByOptions
) => {
  const { workspaceSlug, projectId: routeProjectId } = useParams();

  const {
    issue: { getIssueById },
    subIssues: subIssuesStore,
  } = useIssueDetail();
  const { updateIssue } = useIssuesActions(storeType);
  const {
    issues: { getIssueIds, addCycleToIssue, removeCycleFromIssue, changeModulesInIssue },
  } = useIssues(storeType);
  const { getProjectById } = useProject();
  const { isIssueTypeEnabled } = useIssueType();

  /**
   * update Issue on Drop, checks if modules or cycles are changed and then calls appropriate functions
   * @param projectId
   * @param issueId
   * @param data
   * @param issueUpdates
   */
  const updateIssueOnDrop = async (
    projectId: string,
    issueId: string,
    data: Partial<TIssue>,
    issueUpdates: {
      [groupKey: string]: {
        ADD: string[];
        REMOVE: string[];
      };
    }
  ) => {
    const errorToastProps = {
      type: TOAST_TYPE.ERROR,
      title: "Error!",
      message: "Error while updating work item",
    };
    const moduleKey = ISSUE_FILTER_DEFAULT_DATA["module"];
    const cycleKey = ISSUE_FILTER_DEFAULT_DATA["cycle"];

    const isModuleChanged = Object.keys(data).includes(moduleKey);
    const isCycleChanged = Object.keys(data).includes(cycleKey);

    if (isCycleChanged && workspaceSlug) {
      if (data[cycleKey]) {
        addCycleToIssue(workspaceSlug.toString(), projectId, data[cycleKey]?.toString() ?? "", issueId).catch(() =>
          setToast(errorToastProps)
        );
      } else {
        removeCycleFromIssue(workspaceSlug.toString(), projectId, issueId).catch(() => setToast(errorToastProps));
      }
      delete data[cycleKey];
    }

    if (isModuleChanged && workspaceSlug && issueUpdates[moduleKey]) {
      changeModulesInIssue(
        workspaceSlug.toString(),
        projectId,
        issueId,
        issueUpdates[moduleKey].ADD,
        issueUpdates[moduleKey].REMOVE
      ).catch(() => setToast(errorToastProps));
      delete data[moduleKey];
    }

    const previousIssue = getIssueById(issueId);
    const previousParentId = previousIssue?.parent_id ?? null;

    await (updateIssue && updateIssue(projectId, issueId, data).catch(() => setToast(errorToastProps)));

    // Sync sub-issue maps + parent counts when nesting via drag
    if (data.hasOwnProperty("parent_id") && data.parent_id) {
      const newParentId = data.parent_id;
      runInAction(() => {
        if (previousParentId && subIssuesStore.subIssues[previousParentId]) {
          const prevKids = subIssuesStore.subIssues[previousParentId].filter((id) => id !== issueId);
          set(subIssuesStore.subIssues, previousParentId, prevKids);
          const prevParent = getIssueById(previousParentId);
          if (prevParent) {
            set(prevParent, "sub_issues_count", prevKids.length);
          }
        }
        const nextKids = concat(subIssuesStore.subIssues[newParentId] ?? [], issueId);
        set(subIssuesStore.subIssues, newParentId, nextKids);
        const nextParent = getIssueById(newParentId);
        if (nextParent) {
          set(nextParent, "sub_issues_count", nextKids.length);
        }
      });
    }
  };

  const handleOnDrop = async (source: GroupDropLocation, destination: GroupDropLocation) => {
    if (
      source.columnId &&
      destination.columnId &&
      destination.columnId === source.columnId &&
      destination.id === source.id
    )
      return;

    if (destination.makeChild && destination.id && source.id) {
      const parent = getIssueById(destination.id);
      const child = getIssueById(source.id);
      const projectId = (child?.project_id ?? routeProjectId?.toString()) as string | undefined;
      const projectDetails = projectId ? getProjectById(projectId) : undefined;
      const typesEnabled =
        (projectId ? isIssueTypeEnabled(projectId) : false) || Boolean(projectDetails?.is_issue_type_enabled);

      if (!canNestUnder(parent, child, { typesEnabled })) {
        setToast({
          title: "Cannot nest work item",
          type: TOAST_TYPE.WARNING,
          message: typesEnabled
            ? "Only Tasks can be nested under Epics."
            : "This work item cannot be nested under the selected parent.",
        });
        return;
      }
    }

    await handleGroupDragDrop(
      source,
      destination,
      getIssueById,
      getIssueIds,
      updateIssueOnDrop,
      groupBy,
      subGroupBy,
      orderBy !== "sort_order"
    ).catch((err) => {
      setToast({
        title: "Error!",
        type: TOAST_TYPE.ERROR,
        message: err?.detail ?? "Failed to perform this action",
      });
    });
  };

  return handleOnDrop;
};
