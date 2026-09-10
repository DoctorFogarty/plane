/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { LockIcon, ChevronDownIcon } from "@plane/propel/icons";
import { PasswordInput, PasswordStrengthIndicator } from "@plane/ui";
import { cn, getPasswordRequirementCopy } from "@plane/utils";

interface PasswordState {
  password: string;
  confirmPassword: string;
}

interface SetPasswordRootProps {
  onPasswordChange?: (password: string) => void;
  onConfirmPasswordChange?: (confirmPassword: string) => void;
  disabled?: boolean;
}

export function passwordsMismatch(password: string, confirmPassword: string): boolean {
  return confirmPassword.length > 0 && password !== confirmPassword;
}

export function SetPasswordRoot({ onPasswordChange, onConfirmPasswordChange, disabled = false }: SetPasswordRootProps) {
  const { t } = useTranslation();
  const requirementCopy = getPasswordRequirementCopy(t);
  const [isExpanded, setIsExpanded] = useState(false);
  const [passwordState, setPasswordState] = useState<PasswordState>({
    password: "",
    confirmPassword: "",
  });

  const handleToggleExpand = useCallback(() => {
    if (disabled) return;
    setIsExpanded((prev) => !prev);
  }, [disabled]);

  const handlePasswordChange = useCallback(
    (field: keyof PasswordState, value: string) => {
      setPasswordState((prev) => ({ ...prev, [field]: value }));
      if (field === "password") onPasswordChange?.(value);
      if (field === "confirmPassword") onConfirmPasswordChange?.(value);
    },
    [onPasswordChange, onConfirmPasswordChange]
  );

  const hasPasswordMismatch = useMemo(
    () => passwordsMismatch(passwordState.password, passwordState.confirmPassword),
    [passwordState]
  );

  const chevronIconClasses = useMemo(
    () =>
      `w-4 h-4 text-placeholder transition-transform duration-300 ease-in-out ${isExpanded ? "rotate-180" : "rotate-0"}`,
    [isExpanded]
  );

  const expandedContentClasses = useMemo(
    () =>
      `flex flex-col gap-4 transition-all duration-300 ease-in-out overflow-hidden px-3 ${
        isExpanded ? "max-h-[32rem] opacity-100" : "max-h-0 opacity-0"
      }`,
    [isExpanded]
  );

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg bg-surface-2 transition-all duration-300 ease-in-out`}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 text-13 transition-colors duration-200",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          isExpanded && "pb-1"
        )}
        onClick={handleToggleExpand}
      >
        <div className="flex items-center gap-1 text-tertiary">
          <LockIcon className="size-3" />
          <span className="font-medium">Set a password</span>
          <span>{`(Optional)`}</span>
        </div>
        <div className="flex items-center gap-2 text-placeholder">
          <ChevronDownIcon className={chevronIconClasses} />
        </div>
      </button>

      <div className={expandedContentClasses}>
        <div className="flex transform flex-col gap-2 pt-1 transition-all duration-300 ease-in-out">
          <PasswordInput
            id="password"
            value={passwordState.password}
            onChange={(value) => handlePasswordChange("password", value)}
            placeholder="Set a password"
            className="transition-all duration-200"
          />
          <PasswordStrengthIndicator password={passwordState.password} copy={requirementCopy} />
        </div>

        <div className="flex flex-col gap-2 pb-2">
          <div className="transform text-13 font-medium text-tertiary transition-all delay-75 duration-300 ease-in-out">
            Confirm password
          </div>

          <div className="transform transition-all delay-100 duration-300 ease-in-out">
            <PasswordInput
              id="confirm-password"
              value={passwordState.confirmPassword}
              onChange={(value) => handlePasswordChange("confirmPassword", value)}
              placeholder="Confirm password"
              className="transition-all duration-200"
            />
            {hasPasswordMismatch ? (
              <p className="mt-1 text-11 text-danger-primary">{t("auth.common.password.errors.match")}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
