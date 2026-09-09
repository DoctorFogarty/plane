/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssuesStoreType } from "@plane/types";
import type { TIssueParams } from "@plane/types";

export type TCollectionRef = {
  workspaceSlug: string;
  projectId?: string;
  entityId: string;
};

export type TIssueRouteIds = {
  workspaceSlug?: string;
  projectId?: string;
  cycleId?: string;
  moduleId?: string;
  viewId?: string;
  userId?: string;
  globalViewId?: string;
};

export function resolveCollectionEntityId(storeType: EIssuesStoreType, ids: TIssueRouteIds): string | undefined {
  switch (storeType) {
    case EIssuesStoreType.CYCLE:
      return ids.cycleId;
    case EIssuesStoreType.MODULE:
      return ids.moduleId;
    case EIssuesStoreType.PROJECT_VIEW:
      return ids.viewId;
    case EIssuesStoreType.PROFILE:
      return ids.userId;
    case EIssuesStoreType.GLOBAL:
      return ids.globalViewId;
    case EIssuesStoreType.PROJECT:
    case EIssuesStoreType.ARCHIVED:
    case EIssuesStoreType.EPIC:
    default:
      return ids.projectId;
  }
}

export function resolveCollectionRef(storeType: EIssuesStoreType, ids: TIssueRouteIds): TCollectionRef | undefined {
  if (!ids.workspaceSlug) return undefined;
  const entityId = resolveCollectionEntityId(storeType, ids);
  if (!entityId) return undefined;
  return {
    workspaceSlug: ids.workspaceSlug,
    projectId: ids.projectId,
    entityId,
  };
}

/**
 * Fetch identity for a collection. `layout` is display-only and must not
 * create a new list key (that would clear the board on list ↔ kanban).
 */
export function issueListRequestKey(args: {
  workspaceSlug: string;
  projectId?: string;
  entityId?: string;
  params: Partial<Record<TIssueParams, string | boolean>> | undefined;
}): string {
  const { layout: _layout, ...identityParams } = args.params ?? {};
  const prefix = [args.workspaceSlug, args.projectId, args.entityId].filter(Boolean).join(":");
  return `${prefix}:${JSON.stringify(identityParams)}`;
}

export function collectionIdentityFromListKey(listKey: string): string {
  const idx = listKey.indexOf(":{");
  return idx === -1 ? listKey : listKey.slice(0, idx);
}
