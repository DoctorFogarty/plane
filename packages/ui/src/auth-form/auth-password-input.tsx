/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { cn } from "@plane/utils";
import type { TPasswordRequirementCopy } from "../form-fields/password/copy";
import { PasswordStrengthIndicator } from "../form-fields/password/indicator";
import { usePasswordAssessment } from "../form-fields/password/use-password-assessment";
import { AuthInput } from "./auth-input";

export type TAuthPasswordInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  showPasswordStrength?: boolean;
  showPasswordToggle?: boolean;
  containerClassName?: string;
  errorClassName?: string;
  copy?: Partial<TPasswordRequirementCopy>;
  onPasswordChange?: (password: string) => void;
};

export function AuthPasswordInput({
  label = "Password",
  error,
  showPasswordStrength = true,
  showPasswordToggle = true,
  containerClassName = "",
  errorClassName = "",
  className = "",
  value = "",
  copy,
  onChange,
  onPasswordChange,
  ...props
}: TAuthPasswordInputProps) {
  const password = typeof value === "string" ? value : "";
  const { assessment } = usePasswordAssessment(password);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onPasswordChange?.(e.target.value);
  };

  return (
    <div className={cn("space-y-2", containerClassName)}>
      <AuthInput
        {...props}
        type="password"
        label={label}
        error={error}
        showPasswordToggle={showPasswordToggle}
        errorClassName={errorClassName}
        className={className}
        value={value}
        onChange={handleChange}
        autoComplete="off"
      />
      {showPasswordStrength ? (
        <PasswordStrengthIndicator password={password} showPolicy assessment={assessment} copy={copy} />
      ) : null}
    </div>
  );
}
