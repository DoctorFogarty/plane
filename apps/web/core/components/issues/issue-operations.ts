/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TOAST_TYPE, setPromiseToast, setToast } from "@plane/propel/toast";
import type { TIssue } from "@plane/types";

export type TIssueOperations = {
  fetch: (workspaceSlug: string, projectId: string, issueId: string, loader?: boolean) => Promise<void>;
  update: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>;
  remove: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  archive?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  restore?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  addCycleToIssue?: (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => Promise<void>;
  addIssueToCycle?: (workspaceSlug: string, projectId: string, cycleId: string, issueIds: string[]) => Promise<void>;
  removeIssueFromCycle?: (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => Promise<void>;
  removeIssueFromModule?: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string
  ) => Promise<void>;
  changeModulesInIssue?: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    addModuleIds: string[],
    removeModuleIds: string[]
  ) => Promise<void>;
};

type TIssueOperationsTranslator = (key: string, options?: Record<string, unknown>) => string;

type TCreateIssueOperationsArgs = {
  t: TIssueOperationsTranslator;
  fetchIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<unknown>;
  updateIssue: (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssue>) => Promise<unknown>;
  removeIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<unknown>;
  archiveIssue?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<unknown>;
  restoreIssue?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<unknown>;
  addCycleToIssue?: (workspaceSlug: string, projectId: string, cycleId: string, issueId: string) => Promise<unknown>;
  addIssueToCycle?: (workspaceSlug: string, projectId: string, cycleId: string, issueIds: string[]) => Promise<unknown>;
  removeIssueFromCycle?: (
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    issueId: string
  ) => Promise<unknown>;
  removeIssueFromModule?: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string
  ) => Promise<unknown>;
  changeModulesInIssue?: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    addModuleIds: string[],
    removeModuleIds: string[]
  ) => Promise<unknown>;
  onFetchError?: (error: unknown) => void;
  onRemoveSuccess?: () => void;
  afterMutation?: (workspaceSlug: string, projectId: string, issueId: string) => void;
};

export function createIssueOperations(args: TCreateIssueOperationsArgs): TIssueOperations {
  const {
    t,
    fetchIssue,
    updateIssue,
    removeIssue,
    archiveIssue,
    restoreIssue,
    addCycleToIssue,
    addIssueToCycle,
    removeIssueFromCycle,
    removeIssueFromModule,
    changeModulesInIssue,
    onFetchError,
    onRemoveSuccess,
    afterMutation,
  } = args;

  const operations: TIssueOperations = {
    fetch: async (workspaceSlug, projectId, issueId) => {
      try {
        await fetchIssue(workspaceSlug, projectId, issueId);
      } catch (error) {
        onFetchError?.(error);
        console.error("Error fetching the work item:", error);
      }
    },
    update: async (workspaceSlug, projectId, issueId, data) => {
      try {
        await updateIssue(workspaceSlug, projectId, issueId, data);
        afterMutation?.(workspaceSlug, projectId, issueId);
      } catch (error) {
        console.error("Error in updating issue:", error);
        setToast({
          title: t("common.error.label"),
          type: TOAST_TYPE.ERROR,
          message: t("entity.update.failed", { entity: t("issue.label") }),
        });
      }
    },
    remove: async (workspaceSlug, projectId, issueId) => {
      try {
        await removeIssue(workspaceSlug, projectId, issueId);
        onRemoveSuccess?.();
        setToast({
          title: t("common.success"),
          type: TOAST_TYPE.SUCCESS,
          message: t("entity.delete.success", { entity: t("issue.label") }),
        });
      } catch (error) {
        console.error("Error in deleting issue:", error);
        setToast({
          title: t("common.error.label"),
          type: TOAST_TYPE.ERROR,
          message: t("entity.delete.failed", { entity: t("issue.label") }),
        });
      }
    },
  };

  if (archiveIssue) {
    operations.archive = async (workspaceSlug, projectId, issueId) => {
      try {
        await archiveIssue(workspaceSlug, projectId, issueId);
      } catch (error) {
        console.error("Error in archiving issue:", error);
      }
    };
  }

  if (restoreIssue) {
    operations.restore = async (workspaceSlug, projectId, issueId) => {
      try {
        await restoreIssue(workspaceSlug, projectId, issueId);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("issue.restore.success.title"),
          message: t("issue.restore.success.message"),
        });
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("issue.restore.failed.message"),
        });
      }
    };
  }

  if (addCycleToIssue) {
    operations.addCycleToIssue = async (workspaceSlug, projectId, cycleId, issueId) => {
      try {
        await addCycleToIssue(workspaceSlug, projectId, cycleId, issueId);
        afterMutation?.(workspaceSlug, projectId, issueId);
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("common.error.label"),
          message: t("issue.add.cycle.failed"),
        });
      }
    };
  }

  if (addIssueToCycle) {
    operations.addIssueToCycle = async (workspaceSlug, projectId, cycleId, issueIds) => {
      try {
        await addIssueToCycle(workspaceSlug, projectId, cycleId, issueIds);
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("common.error.label"),
          message: t("issue.add.cycle.failed"),
        });
      }
    };
  }

  if (removeIssueFromCycle) {
    operations.removeIssueFromCycle = async (workspaceSlug, projectId, cycleId, issueId) => {
      try {
        const removeFromCyclePromise = removeIssueFromCycle(workspaceSlug, projectId, cycleId, issueId);
        setPromiseToast(removeFromCyclePromise, {
          loading: t("issue.remove.cycle.loading"),
          success: {
            title: t("common.success"),
            message: () => t("issue.remove.cycle.success"),
          },
          error: {
            title: t("common.error.label"),
            message: () => t("issue.remove.cycle.failed"),
          },
        });
        await removeFromCyclePromise;
        afterMutation?.(workspaceSlug, projectId, issueId);
      } catch (error) {
        console.error("Error in removing issue from cycle:", error);
      }
    };
  }

  if (removeIssueFromModule) {
    operations.removeIssueFromModule = async (workspaceSlug, projectId, moduleId, issueId) => {
      try {
        const removeFromModulePromise = removeIssueFromModule(workspaceSlug, projectId, moduleId, issueId);
        setPromiseToast(removeFromModulePromise, {
          loading: t("issue.remove.module.loading"),
          success: {
            title: t("common.success"),
            message: () => t("issue.remove.module.success"),
          },
          error: {
            title: t("common.error.label"),
            message: () => t("issue.remove.module.failed"),
          },
        });
        await removeFromModulePromise;
        afterMutation?.(workspaceSlug, projectId, issueId);
      } catch (error) {
        console.error("Error in removing issue from module:", error);
      }
    };
  }

  if (changeModulesInIssue) {
    operations.changeModulesInIssue = async (workspaceSlug, projectId, issueId, addModuleIds, removeModuleIds) => {
      await changeModulesInIssue(workspaceSlug, projectId, issueId, addModuleIds, removeModuleIds);
      afterMutation?.(workspaceSlug, projectId, issueId);
    };
  }

  return operations;
}
