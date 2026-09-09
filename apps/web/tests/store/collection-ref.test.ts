/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { collectionIdentityFromListKey, issueListRequestKey } from "@/store/issue/helpers/collection-ref";

describe("issueListRequestKey", () => {
  it("omits layout so list and board share a collection identity", () => {
    const listKey = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      entityId: "proj-1",
      params: { layout: "list", state: "todo", group_by: "state" },
    });
    const boardKey = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      entityId: "proj-1",
      params: { layout: "kanban", state: "todo", group_by: "state" },
    });

    expect(listKey).toBe(boardKey);
    expect(listKey).not.toContain("layout");
    expect(collectionIdentityFromListKey(listKey)).toBe("acme:proj-1:proj-1");
    expect(collectionIdentityFromListKey(listKey)).toBe(collectionIdentityFromListKey(boardKey));
  });

  it("changes identity when the entity changes", () => {
    const projectA = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-a",
      entityId: "proj-a",
      params: { state: "todo" },
    });
    const projectB = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-b",
      entityId: "proj-b",
      params: { state: "todo" },
    });

    expect(collectionIdentityFromListKey(projectA)).not.toBe(collectionIdentityFromListKey(projectB));
  });

  it("keeps grouping changes in the request key", () => {
    const byState = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      params: { group_by: "state" },
    });
    const byPriority = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      params: { group_by: "priority" },
    });

    expect(byState).not.toBe(byPriority);
    expect(collectionIdentityFromListKey(byState)).toBe(collectionIdentityFromListKey(byPriority));
  });
});
