/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  issueListRequestKey,
  resolveBeginIssuesFetch,
  shouldReuseWarmCollection,
} from "@/store/issue/helpers/collection-ref";

const listKeyFor = (projectId: string) =>
  issueListRequestKey({
    workspaceSlug: "acme",
    projectId,
    entityId: projectId,
    params: { group_by: "state" },
  });

describe("resolveBeginIssuesFetch", () => {
  it("restores project A after A → B → A without an init-loader", () => {
    const keyA = listKeyFor("proj-a");
    const keyB = listKeyFor("proj-b");

    expect(
      resolveBeginIssuesFetch({
        currentListKey: keyA,
        nextListKey: keyB,
        hasCurrentData: true,
        hasSnapshot: false,
        loadType: "init-loader",
      })
    ).toEqual({ action: "clear", loader: "init-loader" });

    expect(
      resolveBeginIssuesFetch({
        currentListKey: keyB,
        nextListKey: keyA,
        hasCurrentData: true,
        hasSnapshot: true,
        loadType: "init-loader",
      })
    ).toEqual({ action: "restore-snapshot", loader: "mutation" });
  });

  it("does not restore a snapshot if the outgoing list was cleared first", () => {
    const keyA = listKeyFor("proj-a");
    const keyB = listKeyFor("proj-b");

    expect(
      resolveBeginIssuesFetch({
        currentListKey: keyA,
        nextListKey: keyB,
        hasCurrentData: false,
        hasSnapshot: false,
        loadType: "init-loader",
      })
    ).toEqual({ action: "clear", loader: "init-loader" });

    expect(
      resolveBeginIssuesFetch({
        currentListKey: keyB,
        nextListKey: keyA,
        hasCurrentData: true,
        hasSnapshot: false,
        loadType: "init-loader",
      })
    ).toEqual({ action: "clear", loader: "init-loader" });
  });
});

describe("shouldReuseWarmCollection", () => {
  it("does not reuse A after A → B still has A's completed key", () => {
    const keyA = listKeyFor("proj-a");
    const keyB = listKeyFor("proj-b");

    expect(
      shouldReuseWarmCollection({
        loadType: "init-loader",
        currentListKey: keyB,
        nextListKey: keyA,
        lastCompletedRequestKey: keyA,
        hasCurrentData: true,
      })
    ).toBe(false);
  });

  it("reuses a remount of the same list", () => {
    const keyA = listKeyFor("proj-a");

    expect(
      shouldReuseWarmCollection({
        loadType: "init-loader",
        currentListKey: keyA,
        nextListKey: keyA,
        lastCompletedRequestKey: keyA,
        hasCurrentData: true,
      })
    ).toBe(true);
  });
});
