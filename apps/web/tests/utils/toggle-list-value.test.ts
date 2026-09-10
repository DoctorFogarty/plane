/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { setListMembership, toggleListValue, toggleListValues } from "@plane/utils";

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

describe("setListMembership", () => {
  it("adds a missing value without mutating the source", () => {
    const source = ["a"];
    expect(setListMembership(source, "b", true)).toEqual(["a", "b"]);
    expect(source).toEqual(["a"]);
  });

  it("is a no-op when the value is already present", () => {
    const source = ["a", "b"];
    expect(setListMembership(source, "a", true)).toEqual(["a", "b"]);
    expect(source).toEqual(["a", "b"]);
  });

  it("removes an existing value without mutating the source", () => {
    const source = ["a", "b"];
    expect(setListMembership(source, "a", false)).toEqual(["b"]);
    expect(source).toEqual(["a", "b"]);
  });

  it("is a no-op when removing a value that is already absent", () => {
    expect(setListMembership(["b"], "a", false)).toEqual(["b"]);
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
