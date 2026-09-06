/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPasswordFeedbackKey, TPasswordScore } from "@plane/constants";
import { PASSWORD_MIN_ZXCVBN_SCORE } from "@plane/constants";

export const isPasswordAcceptable = (score: number): boolean => score >= PASSWORD_MIN_ZXCVBN_SCORE;

const COMMON_WARNING_PATTERNS = [
  "common password",
  "commonly used password",
  "word by itself",
  "names and surnames",
  "common names",
];

const SEQUENCE_WARNING_PATTERNS = ["sequence", "keyboard pattern", "straight row"];

const YEAR_WARNING_PATTERNS = ["year", "date"];

const REPEAT_WARNING_PATTERNS = ["repeat"];

const matchesAny = (text: string, patterns: string[]): boolean => {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
};

export const mapZxcvbnWarning = (warning: string | null | undefined): TPasswordFeedbackKey | null => {
  if (!warning) return null;
  if (matchesAny(warning, REPEAT_WARNING_PATTERNS)) return "repeat";
  if (matchesAny(warning, SEQUENCE_WARNING_PATTERNS)) return "sequence";
  if (matchesAny(warning, YEAR_WARNING_PATTERNS)) return "year";
  if (matchesAny(warning, COMMON_WARNING_PATTERNS)) return "common";
  return "avoid_common";
};

export const mapZxcvbnSuggestion = (suggestion: string): TPasswordFeedbackKey => {
  const lower = suggestion.toLowerCase();
  if (lower.includes("another word") || lower.includes("uncommon word")) return "add_words";
  if (lower.includes("repeat")) return "repeat";
  if (lower.includes("sequence") || lower.includes("keyboard")) return "sequence";
  if (lower.includes("year") || lower.includes("date")) return "year";
  return "avoid_common";
};

export const mapZxcvbnFeedback = (
  warning: string | null | undefined,
  suggestions: string[] | null | undefined
): { warningKey: TPasswordFeedbackKey | null; suggestionKeys: TPasswordFeedbackKey[] } => {
  const warningKey = mapZxcvbnWarning(warning);
  const suggestionKeys = (suggestions ?? [])
    .map(mapZxcvbnSuggestion)
    .filter((key, index, all) => all.indexOf(key) === index);
  return { warningKey, suggestionKeys };
};

export const clampPasswordScore = (score: number): TPasswordScore => {
  if (score <= 0) return 0;
  if (score >= 4) return 4;
  return score as TPasswordScore;
};

export const getPasswordRequirementCopy = (t: (key: string) => string) => ({
  policy: t("auth.common.password.requirements.policy"),
  tooEasy: t("auth.common.password.requirements.too_easy"),
  stillTooEasy: t("auth.common.password.requirements.still_too_easy"),
  accepted: t("auth.common.password.requirements.accepted"),
  hardToGuess: t("auth.common.password.requirements.hard_to_guess"),
  common: t("auth.common.password.requirements.feedback.common"),
  sequence: t("auth.common.password.requirements.feedback.sequence"),
  year: t("auth.common.password.requirements.feedback.year"),
  repeat: t("auth.common.password.requirements.feedback.repeat"),
  avoidCommon: t("auth.common.password.requirements.feedback.avoid_common"),
  addWords: t("auth.common.password.requirements.feedback.add_words"),
});
