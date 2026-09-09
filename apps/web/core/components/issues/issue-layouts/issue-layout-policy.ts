/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
import type { TIssue } from "@plane/types";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import type { IQuickActionProps } from "./list/list-view-types";
import {
  AllIssueQuickActions,
  ArchivedIssueQuickActions,
  CycleIssueQuickActions,
  ModuleIssueQuickActions,
  ProjectIssueQuickActions,
} from "./quick-action-dropdowns";

export type TIssueLayoutPolicy = {
  QuickActions: FC<IQuickActionProps>;
  viewId?: string;
  isCompletedCycle: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue | void>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
};

const QUICK_ACTIONS: Partial<Record<EIssuesStoreType, FC<IQuickActionProps>>> = {
  [EIssuesStoreType.PROJECT]: ProjectIssueQuickActions,
  [EIssuesStoreType.PROJECT_VIEW]: ProjectIssueQuickActions,
  [EIssuesStoreType.EPIC]: ProjectIssueQuickActions,
  [EIssuesStoreType.CYCLE]: CycleIssueQuickActions,
  [EIssuesStoreType.MODULE]: ModuleIssueQuickActions,
  [EIssuesStoreType.ARCHIVED]: ArchivedIssueQuickActions,
  [EIssuesStoreType.GLOBAL]: AllIssueQuickActions,
};

export function useIssueLayoutPolicy(params: {
  workspaceSlug?: string;
  projectId?: string;
  entityId?: string;
  storeType?: EIssuesStoreType;
}): TIssueLayoutPolicy {
  const inferredStoreType = useIssueStoreType();
  const storeType = params.storeType ?? inferredStoreType;
  const { issues } = useIssues(storeType);
  const { currentProjectCompletedCycleIds } = useCycle();
  const { allowPermissions } = useUserPermissions();

  const isCompletedCycle =
    storeType === EIssuesStoreType.CYCLE &&
    !!params.entityId &&
    !!currentProjectCompletedCycleIds?.includes(params.entityId);

  const canEditPropertiesBasedOnProject = (projectId: string) => {
    if (isCompletedCycle) return false;
    return allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      params.workspaceSlug,
      projectId
    );
  };

  const { workspaceSlug, projectId, entityId } = params;
  const addIssuesToView =
    workspaceSlug &&
    projectId &&
    entityId &&
    (storeType === EIssuesStoreType.CYCLE || storeType === EIssuesStoreType.MODULE)
      ? (issueIds: string[]) => {
          if (storeType === EIssuesStoreType.CYCLE && "addIssueToCycle" in issues) {
            return issues.addIssueToCycle(workspaceSlug, projectId, entityId, issueIds);
          }
          if (storeType === EIssuesStoreType.MODULE && "addIssuesToModule" in issues) {
            return issues.addIssuesToModule(workspaceSlug, projectId, entityId, issueIds);
          }
          return Promise.resolve();
        }
      : undefined;

  return {
    QuickActions: QUICK_ACTIONS[storeType] ?? ProjectIssueQuickActions,
    viewId: entityId,
    isCompletedCycle,
    addIssuesToView,
    canEditPropertiesBasedOnProject,
  };
}
