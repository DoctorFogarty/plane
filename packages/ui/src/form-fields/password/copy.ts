/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPasswordAssessment, TPasswordFeedbackKey } from "@plane/constants";

export type TPasswordRequirementCopy = {
  policy: string;
  tooEasy: string;
  stillTooEasy: string;
  accepted: string;
  hardToGuess: string;
  common: string;
  sequence: string;
  year: string;
  repeat: string;
  avoidCommon: string;
  addWords: string;
};

export const DEFAULT_PASSWORD_REQUIREMENT_COPY: TPasswordRequirementCopy = {
  policy: "Use a long phrase you don’t use elsewhere. Avoid common words, names, and years.",
  tooEasy: "Too easy to guess.",
  stillTooEasy: "Still too easy to guess. Add another uncommon word.",
  accepted: "You can continue.",
  hardToGuess: "Hard to guess.",
  common: "Avoid common passwords and predictable patterns.",
  sequence: "Avoid sequences and keyboard patterns.",
  year: "Avoid years and dates.",
  repeat: "Avoid repeated words and characters.",
  avoidCommon: "Avoid common words, names, and years.",
  addWords: "Add another uncommon word.",
};

const feedbackCopy = (key: TPasswordFeedbackKey, copy: TPasswordRequirementCopy): string => {
  switch (key) {
    case "common":
      return copy.common;
    case "sequence":
      return copy.sequence;
    case "year":
      return copy.year;
    case "repeat":
      return copy.repeat;
    case "add_words":
      return copy.addWords;
    default:
      return copy.avoidCommon;
  }
};

export const getPasswordCoachMessage = (
  assessment: TPasswordAssessment | null,
  copy: TPasswordRequirementCopy
): string | null => {
  if (!assessment) return null;
  if (assessment.acceptable) {
    return assessment.score >= 4 ? copy.hardToGuess : copy.accepted;
  }
  if (assessment.warningKey) {
    return feedbackCopy(assessment.warningKey, copy);
  }
  const firstSuggestion = assessment.suggestionKeys[0];
  if (firstSuggestion) {
    return feedbackCopy(firstSuggestion, copy);
  }
  return assessment.score <= 1 ? copy.tooEasy : copy.stillTooEasy;
};

export const getPasswordTickColor = (score: number, filled: boolean): string => {
  if (!filled) return "bg-layer-1";
  if (score <= 1) return "bg-danger-primary";
  if (score === 2) return "bg-orange-500";
  return "bg-success-primary";
};

export const getPasswordCoachColor = (assessment: TPasswordAssessment | null): string => {
  if (!assessment) return "text-tertiary";
  if (assessment.score <= 1) return "text-danger-primary";
  if (assessment.score === 2) return "text-orange-500";
  return "text-success-primary";
};
