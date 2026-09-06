/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { TPasswordAssessment } from "@plane/constants";
import { cn } from "@plane/utils";
import {
  DEFAULT_PASSWORD_REQUIREMENT_COPY,
  getPasswordCoachColor,
  getPasswordCoachMessage,
  getPasswordTickColor,
  type TPasswordRequirementCopy,
} from "./copy";
import { usePasswordAssessment } from "./use-password-assessment";

export interface PasswordStrengthIndicatorProps {
  password: string;
  showPolicy?: boolean;
  copy?: Partial<TPasswordRequirementCopy>;
  assessment?: TPasswordAssessment | null;
  /** @deprecated Visibility is owned by the indicator. Kept so existing call sites type-check. */
  showCriteria?: boolean;
  /** @deprecated Visibility is owned by the indicator. Kept so existing call sites type-check. */
  isFocused?: boolean;
}

export function PasswordStrengthIndicator({
  password,
  showPolicy = true,
  copy: copyOverrides,
  assessment: assessmentProp,
}: PasswordStrengthIndicatorProps) {
  const copy = { ...DEFAULT_PASSWORD_REQUIREMENT_COPY, ...copyOverrides };
  const assessed = usePasswordAssessment(password);
  const assessment = assessmentProp === undefined ? assessed.assessment : assessmentProp;
  const hasPassword = password.length > 0;
  const accepted = assessment?.acceptable === true;
  const showMeter = hasPassword && !accepted;
  const showSuccess = hasPassword && accepted;
  const coach = getPasswordCoachMessage(assessment, copy);
  const score = assessment?.score ?? 0;

  if (!showPolicy && !hasPassword) {
    return null;
  }

  return (
    <div className="space-y-2">
      {showPolicy ? <p className="!text-11 text-tertiary">{copy.policy}</p> : null}
      {showMeter ? (
        <div className="space-y-2">
          <meter className="sr-only" min={0} max={4} value={score} aria-label="Password guessability" />
          <div className="flex w-full items-center gap-1" aria-hidden>
            {[0, 1, 2, 3].map((tickIndex) => (
              <React.Fragment key={tickIndex}>
                {tickIndex === 3 ? <span className="bg-tertiary h-2 w-px shrink-0" /> : null}
                <div
                  className={cn(
                    "h-1 min-w-0 flex-1 rounded-xs motion-safe:transition-colors motion-safe:duration-300 motion-reduce:transition-none",
                    getPasswordTickColor(score, score > tickIndex)
                  )}
                />
              </React.Fragment>
            ))}
          </div>
          {coach ? (
            <p className={cn("!text-13 font-medium", getPasswordCoachColor(assessment))} aria-live="polite">
              {coach}
            </p>
          ) : null}
        </div>
      ) : null}
      {showSuccess && coach ? (
        <p className={cn("!text-13 font-medium", getPasswordCoachColor(assessment))}>{coach}</p>
      ) : null}
    </div>
  );
}
