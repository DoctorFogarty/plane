/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  filterHierarchyRootIssueIds,
  isHierarchyLayout,
  shouldAppearAsHierarchyRoot,
} from "@/components/issues/issue-layouts/hierarchy.helpers";

const groupIssueIdsForLayout = (
  layout: string,
  issueIds: string[],
  issuesById: Record<string, { id: string; parent_id: string | null }>,
  parentIdsInResult: ReadonlySet<string>
) => (isHierarchyLayout(layout) ? filterHierarchyRootIssueIds(issueIds, issuesById, parentIdsInResult) : issueIds);

describe("hierarchy layout membership", () => {
  it("treats list as a flat layout", () => {
    expect(isHierarchyLayout("list")).toBe(false);
  });

  it("keeps spreadsheet and gantt as hierarchy layouts", () => {
    expect(isHierarchyLayout("spreadsheet")).toBe(true);
    expect(isHierarchyLayout("gantt_chart")).toBe(true);
  });
});

describe("hierarchy root filtering for epic children", () => {
  const epicId = "epic-1";
  const childId = "task-under-epic";
  const rootTaskId = "root-task";

  const issuesById = {
    [epicId]: { id: epicId, parent_id: null },
    [childId]: { id: childId, parent_id: epicId },
    [rootTaskId]: { id: rootTaskId, parent_id: null },
  };

  it("keeps issues without a parent as roots", () => {
    expect(shouldAppearAsHierarchyRoot(issuesById[rootTaskId], new Set([epicId, childId, rootTaskId]))).toBe(true);
  });

  it("demotes children when their parent is in the result set", () => {
    const parentIds = new Set([epicId, childId, rootTaskId]);
    expect(shouldAppearAsHierarchyRoot(issuesById[childId], parentIds)).toBe(false);
    expect(filterHierarchyRootIssueIds([epicId, childId, rootTaskId], issuesById, parentIds)).toEqual([
      epicId,
      rootTaskId,
    ]);
  });

  it("promotes children when their parent is filtered out of the result set", () => {
    // type_id=Task: epic absent, child task must remain visible as a root row
    const parentIds = new Set([childId, rootTaskId]);
    expect(shouldAppearAsHierarchyRoot(issuesById[childId], parentIds)).toBe(true);
    expect(filterHierarchyRootIssueIds([childId, rootTaskId], issuesById, parentIds)).toEqual([childId, rootTaskId]);
  });

  it("keeps a child in its own group on list even when the parent is in the result set", () => {
    const parentIds = new Set([epicId, childId, rootTaskId]);
    expect(groupIssueIdsForLayout("list", [epicId, childId, rootTaskId], issuesById, parentIds)).toEqual([
      epicId,
      childId,
      rootTaskId,
    ]);
  });

  it("demotes a child from the root group on spreadsheet when the parent is visible", () => {
    const parentIds = new Set([epicId, childId, rootTaskId]);
    expect(groupIssueIdsForLayout("spreadsheet", [epicId, childId, rootTaskId], issuesById, parentIds)).toEqual([
      epicId,
      rootTaskId,
    ]);
  });
});
