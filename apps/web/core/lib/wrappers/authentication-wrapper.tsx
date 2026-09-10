/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable no-shadow */

import type { ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { useSearchParams, usePathname } from "next/navigation";
import useSWR from "swr";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
// helpers
import { EPageTypes } from "@/helpers/authentication.helper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserProfile, useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

type TPageType = EPageTypes;

type TAuthenticationWrapper = {
  children: ReactNode;
  pageType?: TPageType;
};

const isValidURL = (url: string): boolean => {
  const disallowedSchemes = /^(https?|ftp):\/\//i;
  return !disallowedSchemes.test(url);
};

function normalizePath(path: string): string {
  const pathname = path.split("?")[0] ?? path;
  return pathname.replace(/\/+$/, "") || "/";
}

export const AuthenticationWrapper = observer(function AuthenticationWrapper(props: TAuthenticationWrapper) {
  const pathname = usePathname();
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const nextPath = searchParams.get("next_path");
  // props
  const { children, pageType = EPageTypes.AUTHENTICATED } = props;
  // hooks
  const { isLoading: isUserLoading, data: currentUser, fetchCurrentUser } = useUser();
  const { data: currentUserProfile } = useUserProfile();
  const { data: currentUserSettings } = useUserSettings();
  const { loader: workspacesLoader, workspaces } = useWorkspace();

  const { isLoading: isUserSWRLoading } = useSWR("USER_INFORMATION", async () => await fetchCurrentUser(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const isUserOnboard =
    currentUserProfile?.is_onboarded ||
    (currentUserProfile?.onboarding_step?.profile_complete &&
      currentUserProfile?.onboarding_step?.workspace_create &&
      currentUserProfile?.onboarding_step?.workspace_invite &&
      currentUserProfile?.onboarding_step?.workspace_join) ||
    false;

  const redirect = useMemo(() => {
    const getLoginRedirectUrl = (): string => {
      const nextPathFromLocation = `${pathname}${search ? `?${search}` : ""}`;
      const params = new URLSearchParams();
      if (nextPathFromLocation && nextPathFromLocation !== "/") {
        params.set("next_path", nextPathFromLocation);
      }
      const inviteCode = searchParams.get("code") || searchParams.get("invite_code");
      const workspaceSlug = searchParams.get("slug") || searchParams.get("workspace_slug");
      if (inviteCode) params.set("invite_code", inviteCode);
      if (workspaceSlug) params.set("workspace_slug", workspaceSlug);
      const query = params.toString();
      return query ? `/?${query}` : "/";
    };

    const getWorkspaceRedirectionUrl = (): string => {
      let redirectionRoute = "/create-workspace";

      if (nextPath && isValidURL(nextPath.toString())) {
        return nextPath.toString();
      }

      const currentWorkspaceSlug =
        currentUserSettings?.workspace?.last_workspace_slug || currentUserSettings?.workspace?.fallback_workspace_slug;

      const isCurrentWorkspaceValid = Object.values(workspaces || {}).findIndex(
        (workspace) => workspace.slug === currentWorkspaceSlug
      );

      if (isCurrentWorkspaceValid >= 0) redirectionRoute = `/${currentWorkspaceSlug}`;

      return redirectionRoute;
    };

    if (pageType === EPageTypes.PUBLIC) return null;

    if (pageType === EPageTypes.NON_AUTHENTICATED) {
      if (!currentUser?.id) return null;
      if (currentUserProfile?.id && isUserOnboard) {
        return { to: getWorkspaceRedirectionUrl(), replace: false };
      }
      return { to: "/onboarding", replace: false };
    }

    if (pageType === EPageTypes.ONBOARDING) {
      if (!currentUser?.id) return { to: getLoginRedirectUrl(), replace: false };
      if (currentUser && currentUserProfile?.id && isUserOnboard) {
        return { to: getWorkspaceRedirectionUrl(), replace: true };
      }
      return null;
    }

    if (pageType === EPageTypes.SET_PASSWORD) {
      if (!currentUser?.id) return { to: getLoginRedirectUrl(), replace: false };
      if (currentUser && !currentUser?.is_password_autoset && currentUserProfile?.id && isUserOnboard) {
        return { to: getWorkspaceRedirectionUrl(), replace: false };
      }
      return null;
    }

    if (pageType === EPageTypes.AUTHENTICATED) {
      if (currentUser?.id) {
        if (currentUserProfile && currentUserProfile?.id && isUserOnboard) return null;
        return { to: "/onboarding", replace: false };
      }
      return { to: getLoginRedirectUrl(), replace: false };
    }

    return null;
  }, [
    currentUser,
    currentUserProfile,
    currentUserSettings?.workspace?.fallback_workspace_slug,
    currentUserSettings?.workspace?.last_workspace_slug,
    isUserOnboard,
    nextPath,
    pageType,
    pathname,
    search,
    searchParams,
    workspaces,
  ]);

  const redirectTo = redirect?.to ?? null;
  const redirectReplace = redirect?.replace ?? false;
  const lastRedirectRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!redirectTo) {
      lastRedirectRef.current = null;
      return;
    }
    if (normalizePath(pathname) === normalizePath(redirectTo)) return;
    if (lastRedirectRef.current === redirectTo) return;
    lastRedirectRef.current = redirectTo;
    if (redirectReplace) router.replace(redirectTo);
    else router.push(redirectTo);
  }, [pathname, redirectReplace, redirectTo, router]);

  if ((isUserSWRLoading || isUserLoading || workspacesLoader) && !currentUser?.id)
    return (
      <div className="relative flex h-screen w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );

  if (redirect) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center">
        <LogoSpinner />
      </div>
    );
  }

  return <>{children}</>;
});
