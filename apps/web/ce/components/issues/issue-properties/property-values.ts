/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueProperty, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";

export function isEmptyPropertyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isMultiProperty(property: TIssueProperty): boolean {
  const settings = property.settings || {};
  return Boolean(settings.is_multi || settings.display_format === "multi");
}

function isReadonlyText(property: TIssueProperty): boolean {
  const settings = property.settings || {};
  return (settings.display_format || settings.format) === "readonly";
}

/**
 * Build default property values for a set of active properties.
 * Prefers settings.default_value; for DROPDOWN uses options marked is_default.
 */
export function buildDefaultPropertyValues(properties: TIssueProperty[]): TIssuePropertyValues {
  const values: TIssuePropertyValues = {};

  for (const property of properties) {
    const settings = property.settings || {};

    if (property.property_type === "BOOLEAN") {
      if (settings.default_value !== undefined && settings.default_value !== null) {
        values[property.id] = Boolean(settings.default_value);
      } else {
        values[property.id] = false;
      }
      continue;
    }

    if (isReadonlyText(property)) {
      if (settings.readonly_value !== undefined) {
        values[property.id] = settings.readonly_value;
      }
      continue;
    }

    if (settings.default_value !== undefined && settings.default_value !== null && settings.default_value !== "") {
      values[property.id] = settings.default_value;
      continue;
    }

    if (property.property_type === "DROPDOWN") {
      const defaultOptions = (property.options || []).filter((o) => o.is_active && o.is_default);
      if (!defaultOptions.length) continue;
      if (isMultiProperty(property)) {
        values[property.id] = defaultOptions.map((o) => o.id);
      } else {
        values[property.id] = defaultOptions[0].id;
      }
    }
  }

  return values;
}

/**
 * Validate required active properties. Skips BOOLEAN and readonly TEXT.
 * Returns an errors map (empty when valid).
 */
export function validateRequiredPropertyValues(
  properties: TIssueProperty[],
  values: TIssuePropertyValues
): TIssuePropertyValueErrors {
  const errors: TIssuePropertyValueErrors = {};

  for (const property of properties) {
    if (!property.is_required) continue;
    if (property.property_type === "BOOLEAN") continue;
    if (isReadonlyText(property)) continue;
    if (isEmptyPropertyValue(values[property.id])) {
      errors[property.id] = `${property.name} is required`;
    }
  }

  return errors;
}

/** True when any active property is required (excluding BOOLEAN / readonly TEXT). */
export function hasRequiredCustomProperties(properties: TIssueProperty[]): boolean {
  return properties.some((property) => {
    if (!property.is_required) return false;
    if (property.property_type === "BOOLEAN") return false;
    if (isReadonlyText(property)) return false;
    return true;
  });
}
