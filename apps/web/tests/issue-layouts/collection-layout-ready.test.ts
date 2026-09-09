/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { EIssueLayoutTypes } from "@plane/types";
import { shouldRenderCollectionLoader } from "@/components/issues/issue-layouts/collection-layout-ready";
import { ActiveLoader } from "@/components/issues/issue-layouts/issue-layout-HOC";

describe("collection layout readiness", () => {
  it("renders a loader when the filter map is empty instead of returning null", () => {
    expect(
      shouldRenderCollectionLoader({
        workspaceSlug: "acme",
        projectId: "proj-1",
        entityId: "proj-1",
      })
    ).toBe(true);
    expect(
      shouldRenderCollectionLoader({
        workspaceSlug: "acme",
        projectId: "proj-1",
        entityId: "proj-1",
        workItemFilters: {
          richFilters: {},
          displayFilters: undefined,
          displayProperties: undefined,
          kanbanFilters: undefined,
        },
        initialWorkItemFilters: {
          richFilters: {},
          displayFilters: undefined,
          displayProperties: undefined,
          kanbanFilters: undefined,
        },
      })
    ).toBe(false);
  });

  it("builds ActiveLoader without a Suspense blank frame", () => {
    const node = ActiveLoader({ layout: EIssueLayoutTypes.LIST });
    expect(isValidElement(node)).toBe(true);
    expect(node).not.toBeNull();
    expect(String(node.type)).not.toMatch(/Suspense/i);
  });
});
