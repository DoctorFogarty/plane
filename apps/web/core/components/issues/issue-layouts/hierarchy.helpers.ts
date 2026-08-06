/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";

/**
 * Layouts that render parent→child trees and must never show children as root rows.
 */
export const HIERARCHY_LAYOUTS = ["list", "spreadsheet", "gantt_chart"] as const;

export type THierarchyLayout = (typeof HIERARCHY_LAYOUTS)[number];

export const isHierarchyLayout = (layout: string | undefined | null): layout is THierarchyLayout =>
  !!layout && (HIERARCHY_LAYOUTS as readonly string[]).includes(layout);

/**
 * Whether `child` may be nested under `parent`.
 * When work-item types are enabled, only Epics may be parents of non-Epic items.
 * Always blocks self and obvious direct cycles (child already parent of parent).
 */
export const canNestUnder = (
  parent: TIssue | undefined,
  child: TIssue | undefined,
  options?: { typesEnabled?: boolean }
): boolean => {
  if (!parent?.id || !child?.id) return false;
  if (parent.id === child.id) return false;
  if (parent.parent_id === child.id) return false;
  if (child.is_epic) return false;

  if (options?.typesEnabled) {
    return Boolean(parent.is_epic);
  }

  return true;
};

export type TCreateChildModalHandlers = {
  setIssueCrudOperationState: (state: {
    create: { toggle: boolean; parentIssueId: string | undefined; issue: TIssue | undefined };
    existing: { toggle: boolean; parentIssueId: string | undefined; issue: TIssue | undefined };
  }) => void;
  issueCrudOperationState: {
    create: { toggle: boolean; parentIssueId: string | undefined; issue: TIssue | undefined };
    existing: { toggle: boolean; parentIssueId: string | undefined; issue: TIssue | undefined };
  };
  toggleCreateIssueModal: (value: boolean) => void;
};

/**
 * Opens the create-work-item modal with `parent_id` prefilled (same path as detail sub-issues widget).
 */
export const openCreateChildModal = (parentIssueId: string, handlers: TCreateChildModalHandlers) => {
  const { setIssueCrudOperationState, issueCrudOperationState, toggleCreateIssueModal } = handlers;
  setIssueCrudOperationState({
    ...issueCrudOperationState,
    create: {
      toggle: !issueCrudOperationState.create.toggle,
      parentIssueId,
      issue: undefined,
    },
  });
  toggleCreateIssueModal(true);
};

export type TReparentDeps = {
  updateIssue: (projectId: string | null | undefined, issueId: string, data: Partial<TIssue>) => Promise<void>;
  /** Sync sub-issue ID maps after parent_id change */
  onParentChanged?: (issueId: string, newParentId: string | null, oldParentId: string | null) => void;
};

/**
 * Sets `parent_id` on an issue (nest under parent, or clear with null).
 * Callers should also ensure the issue is removed from root groupedIssueIds when parentId is set.
 */
export const reparentIssue = async (
  projectId: string | null | undefined,
  issueId: string,
  parentId: string | null,
  oldParentId: string | null | undefined,
  deps: TReparentDeps
): Promise<void> => {
  await deps.updateIssue(projectId, issueId, { parent_id: parentId });
  deps.onParentChanged?.(issueId, parentId, oldParentId ?? null);
};
