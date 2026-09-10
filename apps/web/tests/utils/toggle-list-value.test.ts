/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { toggleListValue, toggleListValues } from "@plane/utils";

describe("toggleListValue", () => {
  it("adds a missing value without mutating the source", () => {
    const source = ["a"];
    expect(toggleListValue(source, "b")).toEqual(["a", "b"]);
    expect(source).toEqual(["a"]);
  });

  it("removes an existing value without mutating the source", () => {
    const source = ["a", "b"];
    expect(toggleListValue(source, "a")).toEqual(["b"]);
    expect(source).toEqual(["a", "b"]);
  });

  it("treats undefined as an empty list", () => {
    expect(toggleListValue(undefined, "a")).toEqual(["a"]);
  });
});

describe("toggleListValues", () => {
  it("toggles a single value", () => {
    expect(toggleListValues(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleListValues(["a", "b"], "a")).toEqual(["b"]);
  });

  it("toggles multiple values against a copy of the source", () => {
    const source = ["a", "c"];
    expect(toggleListValues(source, ["b", "a"])).toEqual(["c", "b"]);
    expect(source).toEqual(["a", "c"]);
  });
});
