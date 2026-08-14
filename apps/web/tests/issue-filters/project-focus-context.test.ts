/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { sortBy } from "lodash-es";
import { getEnabledCustomPropertyIds } from "@plane/utils";

describe("custom display-property project scoping", () => {
  const displayProperties = {
    custom_properties: {
      "prop-a": true,
      "prop-b": true,
      "prop-foreign": true,
      "prop-disabled": false,
    },
  };

  it("returns all enabled IDs only when no project allow-list is supplied", () => {
    expect(sortBy(getEnabledCustomPropertyIds(displayProperties))).toEqual(["prop-a", "prop-b", "prop-foreign"]);
  });

  it("fails closed with an empty allow-list while project definitions load", () => {
    expect(getEnabledCustomPropertyIds(displayProperties, [])).toEqual([]);
  });

  it("intersects enabled IDs with the focused project's active properties", () => {
    expect(sortBy(getEnabledCustomPropertyIds(displayProperties, ["prop-a", "prop-b"]))).toEqual(["prop-a", "prop-b"]);
  });

  it("does not enable properties that are allowed but explicitly disabled", () => {
    expect(getEnabledCustomPropertyIds(displayProperties, ["prop-disabled"])).toEqual([]);
  });
});
