/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
// plane imports
import { ROLE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { LinkIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserWorkspaceRoles } from "@plane/types";
import type { IWorkspaceInviteLink } from "@plane/types";
import { CustomSelect, ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const INVITE_LINK_ROLES: Partial<Record<EUserWorkspaceRoles, string>> = {
  [EUserWorkspaceRoles.GUEST]: ROLE[EUserWorkspaceRoles.GUEST],
  [EUserWorkspaceRoles.MEMBER]: ROLE[EUserWorkspaceRoles.MEMBER],
};

type Props = {
  workspaceSlug: string;
};

export const WorkspaceInviteLinkSection = observer(function WorkspaceInviteLinkSection(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const [isMutating, setIsMutating] = useState(false);

  const { data: inviteLinks, mutate } = useSWR(
    workspaceSlug ? `WORKSPACE_INVITE_LINKS_${workspaceSlug}` : null,
    workspaceSlug ? () => workspaceService.getWorkspaceInviteLinks(workspaceSlug) : null
  );

  const inviteLink: IWorkspaceInviteLink | undefined = inviteLinks?.[0];
  const isEnabled = !!inviteLink?.is_active;

  const handleEnable = async () => {
    setIsMutating(true);
    try {
      if (inviteLink && !inviteLink.is_active) {
        await workspaceService.updateWorkspaceInviteLink(workspaceSlug, inviteLink.id, { is_active: true });
      } else if (!inviteLink) {
        await workspaceService.createWorkspaceInviteLink(workspaceSlug, { role: EUserWorkspaceRoles.MEMBER });
      }
      await mutate();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invite_link.enabled_success"),
      });
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDisable = async () => {
    if (!inviteLink) return;
    setIsMutating(true);
    try {
      await workspaceService.updateWorkspaceInviteLink(workspaceSlug, inviteLink.id, { is_active: false });
      await mutate();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invite_link.disabled_success"),
      });
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (value) await handleEnable();
    else await handleDisable();
  };

  const handleCopy = async () => {
    if (!inviteLink?.invite_link) return;
    try {
      const absoluteLink = new URL(inviteLink.invite_link, window.location.origin).href;
      await copyTextToClipboard(absoluteLink);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invite_link.copied"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("something_went_wrong_please_try_again"),
      });
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm(t("workspace_settings.settings.members.invite_link.regenerate_confirmation"))) return;
    setIsMutating(true);
    try {
      const role = inviteLink?.role ?? EUserWorkspaceRoles.MEMBER;
      await workspaceService.createWorkspaceInviteLink(workspaceSlug, { role: Number(role) });
      await mutate();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invite_link.regenerated_success"),
      });
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleRoleChange = async (role: EUserWorkspaceRoles) => {
    if (!inviteLink) return;
    setIsMutating(true);
    try {
      await workspaceService.updateWorkspaceInviteLink(workspaceSlug, inviteLink.id, { role });
      await mutate();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("workspace_settings.settings.members.invite_link.role_updated"),
      });
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="mb-6 rounded-md border border-subtle bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h5 className="text-14 font-medium">{t("workspace_settings.settings.members.invite_link.title")}</h5>
          <p className="text-13 text-secondary">{t("workspace_settings.settings.members.invite_link.description")}</p>
        </div>
        <ToggleSwitch value={isEnabled} onChange={handleToggle} disabled={isMutating} size="sm" />
      </div>

      {inviteLink && isEnabled && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-subtle bg-surface-2 px-3 py-2">
            <LinkIcon className="size-3.5 shrink-0 text-placeholder" />
            <span className="truncate text-13 text-secondary">
              {typeof window !== "undefined"
                ? new URL(inviteLink.invite_link, window.location.origin).href
                : inviteLink.invite_link}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomSelect
              value={inviteLink.role as EUserWorkspaceRoles}
              label={
                <span className="text-13">
                  {t("workspace_settings.settings.members.invite_link.role")}:{" "}
                  {INVITE_LINK_ROLES[inviteLink.role as EUserWorkspaceRoles] || ROLE[EUserWorkspaceRoles.MEMBER]}
                </span>
              }
              onChange={(val: EUserWorkspaceRoles) => void handleRoleChange(val)}
              buttonClassName="border border-subtle"
              disabled={isMutating}
            >
              {Object.entries(INVITE_LINK_ROLES).map(([key, label]) => (
                <CustomSelect.Option key={key} value={parseInt(key, 10) as EUserWorkspaceRoles}>
                  {label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
            <Button variant="secondary" size="lg" onClick={() => void handleCopy()} disabled={isMutating}>
              {t("workspace_settings.settings.members.invite_link.copy")}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void handleRegenerate()} disabled={isMutating}>
              <RefreshCw className="size-3.5" />
              {t("workspace_settings.settings.members.invite_link.regenerate")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
