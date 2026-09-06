/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordStrengthIndicator } from "@plane/ui";

describe("PasswordStrengthIndicator", () => {
  it("shows only the policy line when the field is empty", () => {
    render(<PasswordStrengthIndicator password="" />);
    expect(
      screen.getByText("Use a long phrase you don’t use elsewhere. Avoid common words, names, and years.")
    ).toBeTruthy();
    expect(screen.queryByRole("meter", { name: "Password guessability" })).toBeNull();
  });

  it("blocks Password1! with a mapped reason and keeps the coach after the value stays", async () => {
    const { rerender } = render(<PasswordStrengthIndicator password="Password1!" />);
    await waitFor(() => {
      expect(screen.getByText("Avoid common passwords and predictable patterns.")).toBeTruthy();
    });
    expect(screen.getByRole("meter", { name: "Password guessability" })).toBeTruthy();
    rerender(<PasswordStrengthIndicator password="Password1!" />);
    expect(screen.getByText("Avoid common passwords and predictable patterns.")).toBeTruthy();
  });

  it("accepts a long passphrase and collapses to the success sentence", async () => {
    render(<PasswordStrengthIndicator password="correct horse battery staple extra" />);
    await waitFor(() => {
      expect(screen.getByText("Hard to guess.")).toBeTruthy();
    });
    expect(screen.queryByRole("meter", { name: "Password guessability" })).toBeNull();
  });
});
