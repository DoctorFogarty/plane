/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  collectionIdentityFromListKey,
  findListSnapshotKey,
  issueListRequestKey,
  listKeyMatchesCollection,
} from "@/store/issue/helpers/collection-ref";

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

describe("listKeyMatchesCollection", () => {
  it("treats project list keys as matching the current project", () => {
    const listKey = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      params: { group_by: "state" },
    });

    expect(listKeyMatchesCollection(listKey, { workspaceSlug: "acme", projectId: "proj-1", entityId: "proj-1" })).toBe(
      true
    );
    expect(listKeyMatchesCollection(listKey, { workspaceSlug: "acme", projectId: "proj-2", entityId: "proj-2" })).toBe(
      false
    );
  });

  it("does not treat a missing list key as a match", () => {
    expect(listKeyMatchesCollection(undefined, { workspaceSlug: "acme", projectId: "proj-1" })).toBe(false);
  });
});

describe("findListSnapshotKey", () => {
  it("prefers an exact key, then the newest identity match", () => {
    const exact = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      params: { group_by: "state" },
    });
    const older = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-1",
      params: { group_by: "priority" },
    });
    const otherProject = issueListRequestKey({
      workspaceSlug: "acme",
      projectId: "proj-2",
      params: { group_by: "state" },
    });

    expect(findListSnapshotKey([older, otherProject, exact], exact)).toBe(exact);
    expect(findListSnapshotKey([older, otherProject], exact)).toBe(older);
    expect(findListSnapshotKey([otherProject], exact)).toBeUndefined();
  });
});
