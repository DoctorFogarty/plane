/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  filterHierarchyRootIssueIds,
  shouldAppearAsHierarchyRoot,
} from "@/components/issues/issue-layouts/hierarchy.helpers";

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
});
