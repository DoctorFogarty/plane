/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import type { TIssueDisplayPropertyKey, TSpreadsheetColumnKey } from "@plane/types";
import { isCustomPropertyColumnKey } from "@plane/utils";
// lib
import { store } from "@/lib/store-context";

export const shouldRenderColumn = (key: TSpreadsheetColumnKey): boolean => {
  if (isCustomPropertyColumnKey(key)) return true;
  const isEstimateEnabled: boolean = store.projectRoot.project.currentProjectDetails?.estimate !== null;
  switch (key as TIssueDisplayPropertyKey) {
    case "estimate":
      return isEstimateEnabled;
    default:
      return true;
  }
};
