/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

/**
 * Mirrors IssueTypeStore.isTypeInProject resolution used by the create modal
 * to reject foreign type_ids after a project switch.
 */
function resolveEffectiveTypeId(
  projectTypeIds: Record<string, string[]>,
  projectId: string | null | undefined,
  typeId: string | null | undefined,
  defaultTypeId: string | null
): string | null {
  if (!projectId) return null;
  const belongs = Boolean(typeId && (projectTypeIds[projectId] || []).includes(typeId));
  return belongs ? (typeId as string) : defaultTypeId;
}

/**
 * Simulates the form bind effect: on project change, always rebind to the
 * current project's default even if a previous type_id somehow still "belongs".
 */
function resolveTypeIdOnProjectBind(args: {
  projectTypeIds: Record<string, string[]>;
  previousProjectId: string | null;
  projectId: string;
  currentTypeId: string | null | undefined;
  defaultTypeId: string | null;
}): { nextTypeId: string | null; shouldResetPropertyValues: boolean } {
  const { projectTypeIds, previousProjectId, projectId, currentTypeId, defaultTypeId } = args;
  const projectChanged = previousProjectId !== null && previousProjectId !== projectId;
  const belongs = Boolean(currentTypeId && (projectTypeIds[projectId] || []).includes(currentTypeId));

  if (currentTypeId && belongs && !projectChanged) {
    return { nextTypeId: currentTypeId, shouldResetPropertyValues: false };
  }

  return {
    nextTypeId: resolveEffectiveTypeId(projectTypeIds, projectId, null, defaultTypeId),
    shouldResetPropertyValues: true,
  };
}

describe("effective type resolution for create modal", () => {
  const projectTypeIds = {
    "project-a": ["type-a1", "type-a2"],
    "project-b": ["type-b1"],
  };

  it("keeps a type_id that belongs to the current project", () => {
    expect(resolveEffectiveTypeId(projectTypeIds, "project-a", "type-a2", "type-a1")).toBe("type-a2");
  });

  it("rejects a foreign type_id and falls back to the project default", () => {
    expect(resolveEffectiveTypeId(projectTypeIds, "project-b", "type-a1", "type-b1")).toBe("type-b1");
  });

  it("falls back when type_id is missing", () => {
    expect(resolveEffectiveTypeId(projectTypeIds, "project-a", null, "type-a1")).toBe("type-a1");
  });

  it("rejects foreign type when switching A → B", () => {
    const afterSwitch = resolveTypeIdOnProjectBind({
      projectTypeIds,
      previousProjectId: "project-a",
      projectId: "project-b",
      currentTypeId: "type-a1",
      defaultTypeId: "type-b1",
    });
    expect(afterSwitch.nextTypeId).toBe("type-b1");
    expect(afterSwitch.shouldResetPropertyValues).toBe(true);
  });

  it("rebinding A → B → A always uses the current project default", () => {
    const toB = resolveTypeIdOnProjectBind({
      projectTypeIds,
      previousProjectId: "project-a",
      projectId: "project-b",
      currentTypeId: "type-a2",
      defaultTypeId: "type-b1",
    });
    expect(toB.nextTypeId).toBe("type-b1");

    const backToA = resolveTypeIdOnProjectBind({
      projectTypeIds,
      previousProjectId: "project-b",
      projectId: "project-a",
      currentTypeId: "type-b1",
      defaultTypeId: "type-a1",
    });
    expect(backToA.nextTypeId).toBe("type-a1");
    expect(backToA.shouldResetPropertyValues).toBe(true);
  });

  it("resets property values on project change even if type id still belongs", () => {
    // Defensive: shared/coincidental type ids must not skip the reset.
    const sharedIds = {
      "project-a": ["shared-type"],
      "project-b": ["shared-type"],
    };
    const result = resolveTypeIdOnProjectBind({
      projectTypeIds: sharedIds,
      previousProjectId: "project-a",
      projectId: "project-b",
      currentTypeId: "shared-type",
      defaultTypeId: "shared-type",
    });
    expect(result.nextTypeId).toBe("shared-type");
    expect(result.shouldResetPropertyValues).toBe(true);
  });

  it("does not reset when staying on the same project with a valid type", () => {
    const result = resolveTypeIdOnProjectBind({
      projectTypeIds,
      previousProjectId: "project-a",
      projectId: "project-a",
      currentTypeId: "type-a2",
      defaultTypeId: "type-a1",
    });
    expect(result.nextTypeId).toBe("type-a2");
    expect(result.shouldResetPropertyValues).toBe(false);
  });
});
