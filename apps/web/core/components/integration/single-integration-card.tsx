/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable promise/always-return */
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { CheckCircle } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel, WORKSPACE_INTEGRATIONS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IAppIntegration, IWorkspaceIntegration } from "@plane/types";
import { Loader } from "@plane/ui";
import GithubLogo from "@/app/assets/services/github.png?url";
import SlackLogo from "@/app/assets/services/slack.png?url";
import { useInstance } from "@/hooks/store/use-instance";
import { useUserPermissions } from "@/hooks/store/user";
import useIntegrationPopup from "@/hooks/use-integration-popup";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { SlackIntegrationService } from "@/services/integrations/slack.service";
import { IntegrationService } from "@/services/integrations";

type Props = {
  integration: IAppIntegration;
};

const integrationDetails: { [key: string]: { logo: string; installed: string; notInstalled: string } } = {
  github: {
    logo: GithubLogo,
    installed: "Activate GitHub on individual projects to sync with specific repositories.",
    notInstalled: "Connect with GitHub with your Plane workspace to sync project work items.",
  },
  slack: {
    logo: SlackLogo,
    installed: "Disconnect workspace to uninstall Slack, or link your Slack account for DMs and slash commands.",
    notInstalled: "Connect Slack to create work items, unfurl links, and send notifications from this workspace.",
  },
};

const integrationService = new IntegrationService();
const slackService = new SlackIntegrationService();

export const SingleIntegrationCard = observer(function SingleIntegrationCard({ integration }: Props) {
  const [deletingIntegration, setDeletingIntegration] = useState(false);
  const { workspaceSlug } = useParams();
  const { config } = useInstance();
  const { allowPermissions } = useUserPermissions();
  const isUserAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const { isMobile } = usePlatformOS();
  const githubAppName = (config?.github_app_name || "").trim().split(/\s+/)[0] || "";
  const isGithubProvider = integration.provider === "github";
  const isSlackProvider = integration.provider === "slack";
  const isGithubAppConfigured =
    !isGithubProvider ||
    (typeof config?.is_github_app_configured === "boolean" ? config.is_github_app_configured : Boolean(githubAppName));
  const isSlackConfigured = !isSlackProvider || Boolean(config?.is_slack_configured);
  const providerReady = isGithubProvider ? isGithubAppConfigured : isSlackProvider ? isSlackConfigured : true;

  const { startAuth, isConnecting: isInstalling } = useIntegrationPopup({
    provider: integration.provider,
    github_app_name: githubAppName,
  });
  const { startAuth: startUserAuth, isConnecting: isLinkingUser } = useIntegrationPopup({
    provider: "slackUser",
  });

  const { data: workspaceIntegrations } = useSWR(workspaceSlug ? WORKSPACE_INTEGRATIONS(workspaceSlug) : null, () =>
    workspaceSlug ? integrationService.getWorkspaceIntegrationsList(workspaceSlug) : null
  );

  const { data: slackUser } = useSWR(
    workspaceSlug && isSlackProvider ? `SLACK_USER_CONNECTION_${workspaceSlug}` : null,
    () => (workspaceSlug ? slackService.getUserConnection(workspaceSlug.toString()) : null)
  );

  const handleRemoveIntegration = async () => {
    if (!workspaceSlug || !integration || !workspaceIntegrations) return;
    const workspaceIntegrationId = workspaceIntegrations?.find((i) => i.integration === integration.id)?.id;
    setDeletingIntegration(true);
    await integrationService
      .deleteWorkspaceIntegration(workspaceSlug, workspaceIntegrationId ?? "")
      .then(() => {
        mutate<IWorkspaceIntegration[]>(
          WORKSPACE_INTEGRATIONS(workspaceSlug),
          (prevData) => prevData?.filter((i) => i.id !== workspaceIntegrationId),
          false
        );
        setDeletingIntegration(false);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Disconnected",
          message: isSlackProvider
            ? "Disconnected workspace from Slack."
            : `${integration.title} integration deleted successfully.`,
        });
      })
      .catch(() => {
        setDeletingIntegration(false);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: `${integration.title} integration could not be deleted. Please try again.`,
        });
      });
  };

  const isInstalled = workspaceIntegrations?.find((i) => i.integration_detail.id === integration.id);
  const notConfiguredCopy = isGithubProvider
    ? "GitHub App is not configured. Set App slug, App ID, and private key in God Mode (Authentication → GitHub), then try again."
    : isSlackProvider
      ? "Slack is not configured. Set Client ID, Client Secret, and Signing Secret in God Mode, then try again."
      : "Connect this integration to your Plane workspace.";

  return (
    <div className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 flex-shrink-0">
          <img
            src={integrationDetails[integration.provider]?.logo || GithubLogo}
            className="h-full w-full object-cover"
            alt={`${integration.title} Logo`}
          />
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-body-xs-medium">
            {integration.title}
            {workspaceIntegrations
              ? isInstalled && <CheckCircle className="h-3.5 w-3.5 fill-transparent text-success-primary" />
              : null}
          </h3>
          <p className="text-body-xs-regular text-secondary">
            {workspaceIntegrations
              ? isInstalled
                ? integrationDetails[integration.provider]?.installed || "Connected to this workspace."
                : !providerReady
                  ? notConfiguredCopy
                  : integrationDetails[integration.provider]?.notInstalled ||
                    "Connect this integration to your Plane workspace."
              : "Loading..."}
          </p>
        </div>
      </div>

      {workspaceIntegrations ? (
        isInstalled ? (
          <div className="flex items-center gap-2">
            {isSlackProvider ? (
              slackUser ? (
                <span className="text-body-xs-regular text-secondary">Slack account linked</span>
              ) : (
                <Button variant="secondary" onClick={() => startUserAuth()} loading={isLinkingUser}>
                  Link your Slack account
                </Button>
              )
            ) : null}
            <Tooltip
              isMobile={isMobile}
              disabled={isUserAdmin}
              tooltipContent={!isUserAdmin ? "You don't have permission to perform this" : null}
            >
              <Button
                className={`${!isUserAdmin ? "hover:cursor-not-allowed" : ""}`}
                variant="error-fill"
                onClick={() => {
                  if (!isUserAdmin) return;
                  handleRemoveIntegration();
                }}
                disabled={!isUserAdmin}
                loading={deletingIntegration}
              >
                {deletingIntegration ? "Disconnecting..." : isSlackProvider ? "Disconnect workspace" : "Uninstall"}
              </Button>
            </Tooltip>
          </div>
        ) : (
          <Tooltip
            isMobile={isMobile}
            disabled={isUserAdmin && providerReady}
            tooltipContent={
              !isUserAdmin
                ? "You don't have permission to perform this"
                : !providerReady
                  ? isSlackProvider
                    ? "Configure Slack credentials in God Mode before connecting"
                    : "Configure App slug, App ID, and private key in God Mode before installing"
                  : null
            }
          >
            <Button
              className={`${!isUserAdmin || !providerReady ? "hover:cursor-not-allowed" : ""}`}
              variant="primary"
              onClick={() => {
                if (!isUserAdmin || !providerReady) return;
                startAuth();
              }}
              disabled={!isUserAdmin || !providerReady}
              loading={isInstalling}
            >
              {isInstalling ? "Connecting..." : isSlackProvider ? "Connect Slack" : "Install"}
            </Button>
          </Tooltip>
        )
      ) : (
        <Loader>
          <Loader.Item height="32px" width="64px" />
        </Loader>
      )}
    </div>
  );
});
