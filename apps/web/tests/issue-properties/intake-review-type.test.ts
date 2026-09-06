/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

/**
 * Mirrors WorkItemAdditionalSidebarProperties type resolution used on
 * intake review: prefer the issue's type_id so form-submitted custom
 * properties are not replaced by the project default type.
 */
function resolveIntakeReviewTypeId(
  issueTypeId: string | null | undefined,
  defaultTypeId: string | null
): string | null {
  return issueTypeId || defaultTypeId || null;
}

function getActivePropertyIdsForType(
  propertiesByType: Record<string, { id: string; is_active: boolean }[]>,
  typeId: string | null
): string[] {
  if (!typeId) return [];
  return (propertiesByType[typeId] || []).filter((property) => property.is_active).map((property) => property.id);
}

describe("intake review type resolution", () => {
  const defaultTypeId = "type-default";
  const formTypeId = "type-form";
  const propertiesByType = {
    [defaultTypeId]: [
      { id: "prop-default-only", is_active: true },
      { id: "prop-shared", is_active: true },
    ],
    [formTypeId]: [
      { id: "prop-form-custom", is_active: true },
      { id: "prop-inactive", is_active: false },
      { id: "prop-shared", is_active: true },
    ],
  };

  it("uses the issue type_id when it differs from the project default", () => {
    const typeId = resolveIntakeReviewTypeId(formTypeId, defaultTypeId);
    expect(typeId).toBe(formTypeId);
    expect(getActivePropertyIdsForType(propertiesByType, typeId)).toEqual(["prop-form-custom", "prop-shared"]);
  });

  it("does not show default-type-only properties for a form-typed issue", () => {
    const typeId = resolveIntakeReviewTypeId(formTypeId, defaultTypeId);
    expect(getActivePropertyIdsForType(propertiesByType, typeId)).not.toContain("prop-default-only");
  });

  it("falls back to the project default when the issue has no type_id", () => {
    const typeId = resolveIntakeReviewTypeId(null, defaultTypeId);
    expect(typeId).toBe(defaultTypeId);
    expect(getActivePropertyIdsForType(propertiesByType, typeId)).toEqual(["prop-default-only", "prop-shared"]);
  });

  it("returns no properties when neither type is available", () => {
    expect(getActivePropertyIdsForType(propertiesByType, resolveIntakeReviewTypeId(null, null))).toEqual([]);
  });
});
