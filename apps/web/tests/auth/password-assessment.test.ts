/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_ZXCVBN_SCORE } from "@plane/constants";
import {
  getPasswordRequirementCopy,
  isPasswordAcceptable,
  mapZxcvbnFeedback,
  mapZxcvbnSuggestion,
  mapZxcvbnWarning,
} from "@plane/utils";
import { passwordsMismatch } from "@/components/onboarding/steps/profile/set-password";

const fixtures = [
  { password: "Password1!", maxScore: 2, acceptable: false },
  { password: "P@ssw0rd", maxScore: 1, acceptable: false },
  { password: "Welcome1!", maxScore: 2, acceptable: false },
  { password: "Admin123!", maxScore: 2, acceptable: false },
  { password: "abcdefgh", maxScore: 1, acceptable: false },
  { password: "correct horse battery staple extra", minScore: 3, acceptable: true },
  { password: "my favorite coffee shop downtown", minScore: 3, acceptable: true },
  { password: "ThisIsAReasonablyLongPassphrase", minScore: 3, acceptable: true },
  { password: "PlaneApp#2024", minScore: 3, acceptable: true },
  { password: "xK9$mQ2pL", minScore: 3, acceptable: true },
];

describe("password assessment contract", () => {
  it("keeps the accept threshold at 3", () => {
    expect(PASSWORD_MIN_ZXCVBN_SCORE).toBe(3);
    expect(isPasswordAcceptable(2)).toBe(false);
    expect(isPasswordAcceptable(3)).toBe(true);
    expect(isPasswordAcceptable(4)).toBe(true);
  });

  it("maps zxcvbn warnings to i18n keys instead of raw English", () => {
    expect(mapZxcvbnWarning("This is similar to a commonly used password.")).toBe("common");
    expect(mapZxcvbnWarning("Sequences like abc or 6543 are easy to guess.")).toBe("sequence");
    expect(mapZxcvbnWarning("Recent years are easy to guess.")).toBe("year");
    expect(mapZxcvbnWarning('Repeats like "aaa" are easy to guess.')).toBe("repeat");
    expect(mapZxcvbnWarning("Something unexpected")).toBe("avoid_common");
    expect(mapZxcvbnWarning("")).toBeNull();
  });

  it("maps zxcvbn suggestions to i18n keys", () => {
    expect(mapZxcvbnSuggestion("Add another word or two. Uncommon words are better.")).toBe("add_words");
    expect(mapZxcvbnSuggestion("Avoid sequences.")).toBe("sequence");
    const mapped = mapZxcvbnFeedback("This is a very common password.", [
      "Add another word or two. Uncommon words are better.",
      "Add another word or two. Uncommon words are better.",
    ]);
    expect(mapped.warningKey).toBe("common");
    expect(mapped.suggestionKeys).toEqual(["add_words"]);
  });

  it("does not treat an 8-character match as valid onboarding state", () => {
    expect(passwordsMismatch("aaaaaaaa", "aaaaaaaa")).toBe(false);
    expect(passwordsMismatch("aaaaaaaa", "bbbbbbbb")).toBe(true);
    expect(isPasswordAcceptable(2)).toBe(false);
  });

  it("builds requirement copy from i18n keys", () => {
    const copy = getPasswordRequirementCopy((key) => key);
    expect(copy.policy).toBe("auth.common.password.requirements.policy");
    expect(copy.addWords).toBe("auth.common.password.requirements.feedback.add_words");
  });

  it("records expected fixture acceptability", () => {
    for (const fixture of fixtures) {
      if (fixture.acceptable) {
        expect(fixture.minScore ?? 0).toBeGreaterThanOrEqual(PASSWORD_MIN_ZXCVBN_SCORE);
      } else {
        expect(fixture.maxScore ?? 4).toBeLessThan(PASSWORD_MIN_ZXCVBN_SCORE);
      }
    }
  });
});
