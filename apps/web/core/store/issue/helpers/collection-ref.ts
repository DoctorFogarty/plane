/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssuesStoreType } from "@plane/types";
import type { TIssueParams, TLoader } from "@plane/types";

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

/**
 * Prefer an exact list key, otherwise the newest snapshot for the same
 * collection (workspace/project/entity). Used when switching projects so a
 * grouping-param mismatch still restores the board instead of a skeleton.
 */
export function findListSnapshotKey(snapshotKeys: readonly string[], nextListKey: string): string | undefined {
  if (snapshotKeys.includes(nextListKey)) return nextListKey;
  const identity = collectionIdentityFromListKey(nextListKey);
  for (let i = snapshotKeys.length - 1; i >= 0; i--) {
    const key = snapshotKeys[i];
    if (collectionIdentityFromListKey(key) === identity) return key;
  }
  return undefined;
}

export function listKeyMatchesCollection(
  listKey: string | undefined,
  ids: { workspaceSlug?: string; projectId?: string; entityId?: string }
): boolean {
  if (!listKey || !ids.workspaceSlug) return false;
  const identity = collectionIdentityFromListKey(listKey);
  const candidates = new Set<string>();
  if (ids.projectId) candidates.add(`${ids.workspaceSlug}:${ids.projectId}`);
  if (ids.entityId) candidates.add(`${ids.workspaceSlug}:${ids.entityId}`);
  if (ids.projectId && ids.entityId) {
    candidates.add(`${ids.workspaceSlug}:${ids.projectId}:${ids.entityId}`);
  }
  return candidates.has(identity);
}

export type TBeginIssuesFetchAction = "restore-snapshot" | "stale-while-revalidate" | "clear";

/**
 * Skip a remount fetch only when this exact list is already on screen.
 * `lastCompletedRequestKey` alone is not enough: after A → B the completed
 * key can still be A while `listKey` is B. Skipping then leaves the HOC
 * showing a skeleton because the list key no longer matches the route.
 */
export function shouldReuseWarmCollection(args: {
  loadType: TLoader;
  currentListKey: string | undefined;
  nextListKey: string;
  lastCompletedRequestKey: string | undefined;
  hasCurrentData: boolean;
}): boolean {
  return (
    args.loadType === "init-loader" &&
    args.currentListKey === args.nextListKey &&
    args.lastCompletedRequestKey === args.nextListKey &&
    args.hasCurrentData
  );
}

/**
 * Decide how to enter a list fetch so project switches can restore a snapshot
 * instead of always taking the full-page init-loader path.
 */
export function resolveBeginIssuesFetch(args: {
  currentListKey: string | undefined;
  nextListKey: string;
  hasCurrentData: boolean;
  hasSnapshot: boolean;
  loadType: TLoader;
}): { action: TBeginIssuesFetchAction; loader: TLoader } {
  const { currentListKey, nextListKey, hasCurrentData, hasSnapshot, loadType } = args;
  const isSameList = currentListKey === nextListKey;

  if (!isSameList) {
    if (hasSnapshot) {
      return { action: "restore-snapshot", loader: loadType === "init-loader" ? "mutation" : loadType };
    }
    const sameCollection =
      !!currentListKey && collectionIdentityFromListKey(currentListKey) === collectionIdentityFromListKey(nextListKey);
    if (sameCollection && hasCurrentData && loadType === "init-loader") {
      return { action: "stale-while-revalidate", loader: "mutation" };
    }
    return { action: "clear", loader: loadType };
  }

  if (hasCurrentData && loadType === "init-loader") {
    return { action: "stale-while-revalidate", loader: "mutation" };
  }
  return { action: hasCurrentData ? "stale-while-revalidate" : "clear", loader: loadType };
}
