/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isNil } from "lodash-es";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  IIssueFilterOptions,
  IIssueFilters,
} from "@plane/types";
import type { TIssueDisplayPropertyKey } from "@plane/types";
import { DEFAULT_DISPLAY_PROPERTIES } from "@/store/issue/issue-details/sub_issues_filter.store";

export const getDisplayPropertiesCount = (
  displayProperties: IIssueDisplayProperties,
  ignoreFields?: TIssueDisplayPropertyKey[]
) => {
  const propertyKeys = Object.keys(displayProperties) as (keyof IIssueDisplayProperties)[];
  const ignoreFieldSet = ignoreFields ? new Set(ignoreFields) : null;

  let count = 0;

  for (const propertyKey of propertyKeys) {
    if (propertyKey === "custom_properties") continue;
    if (ignoreFieldSet?.has(propertyKey as TIssueDisplayPropertyKey)) continue;
    if (displayProperties[propertyKey]) count++;
  }

  for (const enabled of Object.values(displayProperties.custom_properties ?? {})) {
    if (enabled) count++;
  }

  return count;
};

export const removeNillKeys = <T>(obj: T) =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([key, value]) => key && !isNil(value)));

export const isDisplayFiltersApplied = (filters: Partial<IIssueFilters>): boolean => {
  const isDisplayPropertiesApplied = Object.keys(DEFAULT_DISPLAY_PROPERTIES).some(
    (key) => !filters.displayProperties?.[key as keyof IIssueDisplayProperties]
  );

  const hasDisplayFilters = Object.keys(filters.displayFilters ?? {}).some((key) => {
    const value = filters.displayFilters?.[key as keyof IIssueDisplayFilterOptions];
    if (!value) return false;
    if (key === "order_by") {
      return value !== "-created_at";
    }
    return true;
  });

  return isDisplayPropertiesApplied || hasDisplayFilters;
};

export const isFiltersApplied = (filters: IIssueFilterOptions): boolean =>
  Object.values(filters).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  });

export const calculateIdentifierWidth = (projectIdentifierLength: number, maxSequenceId: number): number => {
  const sequenceDigits = Math.max(1, Math.floor(Math.log10(maxSequenceId)) + 1);
  return projectIdentifierLength * 7 + 7 + sequenceDigits * 7;
};
