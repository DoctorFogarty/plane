/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { canAcceptMoreIntakeFormAttachments, parseIntakeFormAttachments } from "@plane/utils";
import { defaultFormFields } from "@/plane-web/components/intake-forms/helpers";

describe("defaultFormFields", () => {
  it("includes optional attachments so new forms show a file picker", () => {
    expect(defaultFormFields()).toEqual(
      expect.arrayContaining([{ key: "attachments", source: "system", required: false }])
    );
  });
});

describe("parseIntakeFormAttachments", () => {
  it("keeps only attachments with an id", () => {
    expect(
      parseIntakeFormAttachments([
        { id: "asset-1", name: "brief.pdf", size: 1200 },
        { name: "missing-id.png", size: 10 },
        "skip-me",
        { id: "", name: "empty-id.txt", size: 4 },
      ])
    ).toEqual([{ id: "asset-1", name: "brief.pdf", size: 1200 }]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(parseIntakeFormAttachments(undefined)).toEqual([]);
    expect(parseIntakeFormAttachments({ id: "asset-1" })).toEqual([]);
  });
});

describe("canAcceptMoreIntakeFormAttachments", () => {
  it("allows adding files up to the max count", () => {
    expect(canAcceptMoreIntakeFormAttachments(2, 3, 5)).toBe(true);
    expect(canAcceptMoreIntakeFormAttachments(2, 4, 5)).toBe(false);
    expect(canAcceptMoreIntakeFormAttachments(0, 0, 5)).toBe(true);
  });

  it("rejects negative counts", () => {
    expect(canAcceptMoreIntakeFormAttachments(-1, 1, 5)).toBe(false);
    expect(canAcceptMoreIntakeFormAttachments(1, -1, 5)).toBe(false);
  });
});
