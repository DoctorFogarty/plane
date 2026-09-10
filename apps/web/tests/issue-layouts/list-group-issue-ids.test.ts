/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { getListGroupIssueIds } from "@/components/issues/issue-layouts/utils";

describe("getListGroupIssueIds", () => {
  it("returns grouped string ids for a list column", () => {
    expect(
      getListGroupIssueIds(
        {
          urgent: ["a", "b"],
          high: ["c"],
        },
        "urgent"
      )
    ).toEqual(["a", "b"]);
  });

  it("flattens subgrouped kanban ids so list layout can render them", () => {
    expect(
      getListGroupIssueIds(
        {
          urgent: {
            backlog: ["a"],
            started: ["b", "c"],
          },
        },
        "urgent"
      )
    ).toEqual(["a", "b", "c"]);
  });

  it("returns undefined when the group is missing", () => {
    expect(getListGroupIssueIds({ urgent: ["a"] }, "high")).toBeUndefined();
    expect(getListGroupIssueIds(undefined, "urgent")).toBeUndefined();
  });
});
