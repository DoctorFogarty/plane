/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel, WORKSPACE_INTEGRATIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { IntegrationCard } from "@/components/project/integration-card";
import { SettingsHeading } from "@/components/settings/heading";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { IntegrationService } from "@/services/integrations";

const integrationService = new IntegrationService();

function ProjectIntegrationsPage() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();

  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const project = projectId ? getProjectById(projectId.toString()) : undefined;
  const pageTitle = project?.name ? `${project.name} - Integrations` : undefined;

  const { data: workspaceIntegrations } = useSWR(
    workspaceSlug && isAdmin ? WORKSPACE_INTEGRATIONS(workspaceSlug.toString()) : null,
    () => (workspaceSlug && isAdmin ? integrationService.getWorkspaceIntegrationsList(workspaceSlug.toString()) : null)
  );

  if (!isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const githubIntegration = workspaceIntegrations?.find((i) => i.integration_detail?.provider === "github");
  const slackIntegration = workspaceIntegrations?.find((i) => i.integration_detail?.provider === "slack");

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("workspace_settings.settings.integrations.heading")}
          description="Link GitHub repositories or Slack channels for this project. Connect the integration in workspace settings first."
        />
        <div className="mt-4">
          {githubIntegration ? (
            <IntegrationCard integration={githubIntegration} />
          ) : (
            <div className="rounded-md border border-subtle bg-surface-1 px-4 py-8 text-center">
              <p className="text-sm font-medium text-primary">No repositories linked</p>
              <p className="text-sm mt-1 text-secondary">
                Connect GitHub in workspace integrations first, then choose a repository here.
              </p>
              <a
                href={`/${workspaceSlug}/settings/integrations`}
                className="text-sm mt-4 inline-block text-accent-primary hover:underline"
              >
                Open workspace integrations
              </a>
            </div>
          )}
          {slackIntegration ? (
            <IntegrationCard integration={slackIntegration} />
          ) : (
            <div className="mt-4 rounded-md border border-subtle bg-surface-1 px-4 py-8 text-center">
              <p className="text-sm font-medium text-primary">No channels connected</p>
              <p className="text-sm mt-1 text-secondary">
                Connect Slack in workspace integrations first, then map a channel here.
              </p>
              <a
                href={`/${workspaceSlug}/settings/integrations`}
                className="text-sm mt-4 inline-block text-accent-primary hover:underline"
              >
                Open workspace integrations
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default observer(ProjectIntegrationsPage);
