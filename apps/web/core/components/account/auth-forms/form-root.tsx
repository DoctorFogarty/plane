/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import { EAuthModes, EAuthSteps } from "@plane/constants";
import type { IEmailCheckData } from "@plane/types";
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import { authErrorHandler } from "@/helpers/authentication.helper";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { AuthService } from "@/services/auth.service";
// local components
import { AuthEmailForm } from "./email";
import { AuthPasswordForm } from "./password";
import { AuthUniqueCodeForm } from "./unique-code";

type TAuthFormRoot = {
  authStep: EAuthSteps;
  authMode: EAuthModes;
  email: string;
  setEmail: (email: string) => void;
  setAuthMode: (authMode: EAuthModes) => void;
  setAuthStep: (authStep: EAuthSteps) => void;
  setErrorInfo: (errorInfo: TAuthErrorInfo | undefined) => void;
  currentAuthMode: EAuthModes;
};

const authService = new AuthService();

export const AuthFormRoot = observer(function AuthFormRoot(props: TAuthFormRoot) {
  const { authStep, authMode, email, setEmail, setAuthMode, setAuthStep, setErrorInfo, currentAuthMode } = props;
  // router
  const router = useAppRouter();
  // query params
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next_path");
  const inviteCode = searchParams.get("invite_code") || undefined;
  const workspaceSlug = searchParams.get("workspace_slug") || searchParams.get("slug") || undefined;
  // states
  const [isExistingEmail, setIsExistingEmail] = useState(false);
  // hooks
  const { config } = useInstance();

  const isSMTPConfigured = config?.is_smtp_configured || false;

  // submit handler- email verification
  const handleEmailVerification = async (data: IEmailCheckData) => {
    setEmail(data.email);
    setErrorInfo(undefined);
    try {
      const response = await authService.emailCheck(data);
      if (response.existing) {
        if (currentAuthMode === EAuthModes.SIGN_UP) setAuthMode(EAuthModes.SIGN_IN);
        if (response.status === "MAGIC_CODE") {
          setAuthStep(EAuthSteps.UNIQUE_CODE);
          void generateEmailUniqueCode(data.email);
        } else if (response.status === "CREDENTIAL") {
          setAuthStep(EAuthSteps.PASSWORD);
        }
      } else {
        if (currentAuthMode === EAuthModes.SIGN_IN) setAuthMode(EAuthModes.SIGN_UP);
        if (response.status === "MAGIC_CODE") {
          setAuthStep(EAuthSteps.UNIQUE_CODE);
          void generateEmailUniqueCode(data.email);
        } else if (response.status === "CREDENTIAL") {
          setAuthStep(EAuthSteps.PASSWORD);
        }
      }
      setIsExistingEmail(response.existing);
    } catch (error) {
      const authError = error as { error_code?: string };
      const errorhandler = authErrorHandler(authError?.error_code?.toString(), data?.email || undefined);
      if (errorhandler?.type) setErrorInfo(errorhandler);
    }
  };

  const handleEmailClear = () => {
    setAuthMode(currentAuthMode);
    setErrorInfo(undefined);
    setEmail("");
    setAuthStep(EAuthSteps.EMAIL);
    const params = new URLSearchParams();
    if (nextPath) params.set("next_path", nextPath);
    if (inviteCode) params.set("invite_code", inviteCode);
    if (workspaceSlug) params.set("workspace_slug", workspaceSlug);
    const query = params.toString();
    const basePath = currentAuthMode === EAuthModes.SIGN_IN ? "/" : "/sign-up";
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  // generating the unique code
  const generateEmailUniqueCode = async (emailAddress: string): Promise<{ code: string } | undefined> => {
    if (!isSMTPConfigured) return;
    const payload = { email: emailAddress };
    try {
      await authService.generateUniqueCode(payload);
      return { code: "" };
    } catch (error) {
      const authError = error as { error_code?: string };
      const errorhandler = authErrorHandler(authError?.error_code?.toString());
      if (errorhandler?.type) setErrorInfo(errorhandler);
      throw error;
    }
  };

  if (authStep === EAuthSteps.EMAIL) {
    return <AuthEmailForm defaultEmail={email} onSubmit={handleEmailVerification} />;
  }
  if (authStep === EAuthSteps.UNIQUE_CODE) {
    return (
      <AuthUniqueCodeForm
        mode={authMode}
        email={email}
        isExistingEmail={isExistingEmail}
        handleEmailClear={handleEmailClear}
        generateEmailUniqueCode={generateEmailUniqueCode}
        nextPath={nextPath || undefined}
        inviteCode={inviteCode}
        workspaceSlug={workspaceSlug}
      />
    );
  }
  if (authStep === EAuthSteps.PASSWORD) {
    return (
      <AuthPasswordForm
        mode={authMode}
        isSMTPConfigured={isSMTPConfigured}
        email={email}
        handleEmailClear={handleEmailClear}
        handleAuthStep={(step: EAuthSteps) => {
          if (step === EAuthSteps.UNIQUE_CODE) generateEmailUniqueCode(email);
          setAuthStep(step);
        }}
        nextPath={nextPath || undefined}
        inviteCode={inviteCode}
        workspaceSlug={workspaceSlug}
      />
    );
  }

  return <></>;
});
