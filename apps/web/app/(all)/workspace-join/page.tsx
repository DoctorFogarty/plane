/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Boxes, LinkIcon } from "lucide-react";
// plane imports
import { WORKSPACE_INVITE_LINK } from "@plane/constants";
import { EUserWorkspaceRoles } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { EmptySpace, EmptySpaceItem } from "@/components/ui/empty-space";
// helpers
import { EPageTypes } from "@/helpers/authentication.helper";
// hooks
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// wrappers
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const ROLE_LABELS: Record<number, string> = {
  [EUserWorkspaceRoles.GUEST]: "Guest",
  [EUserWorkspaceRoles.MEMBER]: "Member",
};

function WorkspaceJoinPage() {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const code = searchParams.get("code");
  const { data: currentUser } = useUser();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAutoJoined, setHasAutoJoined] = useState(false);

  const { data: inviteLinkDetail, error } = useSWR(
    slug && code ? WORKSPACE_INVITE_LINK(slug.toString(), code.toString()) : null,
    slug && code ? () => workspaceService.getWorkspaceInviteLinkPublic(slug.toString(), code.toString()) : null
  );

  const joinPath = slug && code ? `/workspace-join/?slug=${slug}&code=${code}` : null;

  const handleJoin = useCallback(async () => {
    if (!slug || !code) return;
    setIsSubmitting(true);
    try {
      const response = await workspaceService.joinWorkspaceViaInviteLink(slug.toString(), code.toString());
      router.push(`/${response.workspace_slug}`);
    } catch (err: unknown) {
      const errorData = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: errorData?.error || "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [slug, code, router]);

  // Auto-join when an authenticated user lands on a valid invite link
  useEffect(() => {
    if (!currentUser?.id || !inviteLinkDetail || hasAutoJoined || isSubmitting || error) return;
    setHasAutoJoined(true);
    void handleJoin();
  }, [currentUser?.id, inviteLinkDetail, hasAutoJoined, error, isSubmitting, handleJoin]);

  const handleClaim = async () => {
    if (!slug || !code || !email.trim() || !joinPath) return;
    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();
    let invitationId = "";
    try {
      const invitation = await workspaceService.claimWorkspaceInviteLink(
        slug.toString(),
        code.toString(),
        normalizedEmail
      );
      invitationId = invitation.id;
    } catch (err: unknown) {
      // Claim is best-effort: signup can still unlock via invite_code on the auth adapter.
      const errorData = err as { error?: string };
      if (errorData?.error?.toLowerCase().includes("already a member")) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: errorData.error,
        });
        setIsSubmitting(false);
        return;
      }
    }

    const workspaceSlug = slug.toString();
    const signupParams = new URLSearchParams({
      email: normalizedEmail,
      slug: workspaceSlug,
      invite_code: code.toString(),
      workspace_slug: workspaceSlug,
      next_path: joinPath,
    });
    if (invitationId) signupParams.set("invitation_id", invitationId);
    router.push(`/sign-up/?${signupParams.toString()}`);
    setIsSubmitting(false);
  };

  const roleLabel = inviteLinkDetail ? ROLE_LABELS[inviteLinkDetail.role as number] || "Member" : "Member";

  return (
    <AuthenticationWrapper pageType={EPageTypes.PUBLIC}>
      <div className="flex h-full w-full flex-col items-center justify-center px-3">
        {!slug || !code ? (
          <EmptySpace
            title="Invalid invite link"
            description="This invite link is missing required information. Ask your workspace admin for a new link."
          >
            <EmptySpaceItem Icon={Boxes} title="Continue to home" href="/" />
          </EmptySpace>
        ) : error ? (
          <EmptySpace
            title="Invite link not found"
            description="This invite link is inactive or no longer exists. Ask your workspace admin for a new link."
          >
            <EmptySpaceItem Icon={Boxes} title="Continue to home" href="/" />
          </EmptySpace>
        ) : !inviteLinkDetail ? (
          <div className="flex h-full w-full items-center justify-center">
            <LogoSpinner />
          </div>
        ) : currentUser ? (
          <EmptySpace
            title={`Join ${inviteLinkDetail.workspace.name}`}
            description={`You've been invited to join this workspace as a ${roleLabel}. Your workspace is where you'll create projects and collaborate on work.`}
          >
            <EmptySpaceItem
              Icon={LinkIcon}
              title={isSubmitting ? "Joining..." : "Join workspace"}
              action={() => {
                if (!isSubmitting) void handleJoin();
              }}
            />
            <EmptySpaceItem Icon={Boxes} title="Continue to home" href="/" />
          </EmptySpace>
        ) : (
          <div className="shadow-2xl flex w-full flex-col space-y-4 rounded-sm border border-subtle bg-surface-1 px-4 py-8 md:w-1/3">
            <div className="space-y-1 text-center">
              <h2 className="text-18 font-semibold">Join {inviteLinkDetail.workspace.name}</h2>
              <p className="text-13 text-secondary">
                Enter your email to sign up or sign in and join as a {roleLabel}.
              </p>
            </div>
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full"
            />
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!email.trim() || isSubmitting}
              onClick={() => void handleClaim()}
            >
              {isSubmitting ? "Continuing..." : "Continue"}
            </Button>
            <button
              type="button"
              className="text-13 text-secondary underline"
              onClick={() => {
                if (!joinPath || !slug || !code) return;
                const params = new URLSearchParams({
                  invite_code: code.toString(),
                  workspace_slug: slug.toString(),
                  next_path: joinPath,
                });
                router.push(`/?${params.toString()}`);
              }}
            >
              Already have an account? Sign in
            </button>
          </div>
        )}
      </div>
    </AuthenticationWrapper>
  );
}

export default observer(WorkspaceJoinPage);
