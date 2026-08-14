/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import type { TIssueProperty } from "@plane/types";
import {
  buildDefaultPropertyValues,
  hasRequiredCustomProperties,
  isEmptyPropertyValue,
  validateRequiredPropertyValues,
} from "@/plane-web/components/issues/issue-properties/property-values";

function makeProperty(
  overrides: Partial<TIssueProperty> & Pick<TIssueProperty, "id" | "property_type">
): TIssueProperty {
  return {
    name: "Property",
    description: "",
    issue_type_id: "type-1",
    is_required: false,
    is_active: true,
    sort_order: 1,
    settings: {},
    project_id: "project-1",
    workspace_id: "workspace-1",
    options: [],
    ...overrides,
  };
}

describe("property-values helpers", () => {
  it("isEmptyPropertyValue treats null/empty string/empty array as empty", () => {
    expect(isEmptyPropertyValue(null)).toBe(true);
    expect(isEmptyPropertyValue(undefined)).toBe(true);
    expect(isEmptyPropertyValue("")).toBe(true);
    expect(isEmptyPropertyValue("  ")).toBe(true);
    expect(isEmptyPropertyValue([])).toBe(true);
    expect(isEmptyPropertyValue(0)).toBe(false);
    expect(isEmptyPropertyValue(false)).toBe(false);
    expect(isEmptyPropertyValue("x")).toBe(false);
  });

  it("buildDefaultPropertyValues applies boolean false, settings defaults, and dropdown is_default", () => {
    const bool = makeProperty({ id: "bool", property_type: "BOOLEAN" });
    const text = makeProperty({
      id: "text",
      property_type: "TEXT",
      settings: { default_value: "hello", display_format: "single_line" },
    });
    const dropdown = makeProperty({
      id: "dd",
      property_type: "DROPDOWN",
      settings: { display_format: "single" },
      options: [
        {
          id: "opt-1",
          property_id: "dd",
          name: "One",
          sort_order: 1,
          is_default: false,
          is_active: true,
          project_id: "project-1",
          workspace_id: "workspace-1",
        },
        {
          id: "opt-2",
          property_id: "dd",
          name: "Two",
          sort_order: 2,
          is_default: true,
          is_active: true,
          project_id: "project-1",
          workspace_id: "workspace-1",
        },
      ],
    });
    const multi = makeProperty({
      id: "multi",
      property_type: "DROPDOWN",
      settings: { is_multi: true },
      options: [
        {
          id: "m1",
          property_id: "multi",
          name: "A",
          sort_order: 1,
          is_default: true,
          is_active: true,
          project_id: "project-1",
          workspace_id: "workspace-1",
        },
        {
          id: "m2",
          property_id: "multi",
          name: "B",
          sort_order: 2,
          is_default: true,
          is_active: true,
          project_id: "project-1",
          workspace_id: "workspace-1",
        },
      ],
    });

    const values = buildDefaultPropertyValues([bool, text, dropdown, multi]);
    expect(values.bool).toBe(false);
    expect(values.text).toBe("hello");
    expect(values.dd).toBe("opt-2");
    expect(values.multi).toEqual(["m1", "m2"]);
  });

  it("validateRequiredPropertyValues skips BOOLEAN and readonly TEXT", () => {
    const requiredText = makeProperty({ id: "req", property_type: "TEXT", is_required: true, name: "Req" });
    const requiredBool = makeProperty({ id: "bool", property_type: "BOOLEAN", is_required: true, name: "Flag" });
    const readonly = makeProperty({
      id: "ro",
      property_type: "TEXT",
      is_required: true,
      name: "RO",
      settings: { display_format: "readonly", readonly_value: "fixed" },
    });

    const errors = validateRequiredPropertyValues([requiredText, requiredBool, readonly], {});
    expect(errors).toEqual({ req: "Req is required" });
    expect(hasRequiredCustomProperties([requiredText, requiredBool, readonly])).toBe(true);
    expect(hasRequiredCustomProperties([requiredBool, readonly])).toBe(false);
  });
});
