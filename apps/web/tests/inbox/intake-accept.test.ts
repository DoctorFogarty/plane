/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import {
  canStartIntakeAccept,
  resolveIntakeAcceptInteraction,
  shouldRedirectAfterIntakeAccept,
} from "@/components/inbox/content/intake-accept";

describe("intake accept", () => {
  it("accepts by updating status instead of opening the create modal", () => {
    expect(resolveIntakeAcceptInteraction()).toBe("update-status");
  });

  it("does not start accept when a request is already in flight", () => {
    expect(canStartIntakeAccept({ acceptInFlight: true, issueId: "issue-1" })).toBe(false);
  });

  it("does not start accept without an issue id", () => {
    expect(canStartIntakeAccept({ acceptInFlight: false, issueId: undefined })).toBe(false);
  });

  it("starts accept when an issue is ready", () => {
    expect(canStartIntakeAccept({ acceptInFlight: false, issueId: "issue-1" })).toBe(true);
  });

  it("redirects only after a successful status update", () => {
    expect(shouldRedirectAfterIntakeAccept(true)).toBe(true);
    expect(shouldRedirectAfterIntakeAccept(false)).toBe(false);
  });
});
