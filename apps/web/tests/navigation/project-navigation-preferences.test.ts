/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_PREFERENCES } from "@plane/types";

describe("project navigation preferences", () => {
  it("defaults to tabbed project navigation", () => {
    expect(DEFAULT_PROJECT_PREFERENCES.navigationMode).toBe("TABBED");
  });
});
