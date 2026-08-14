/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IGithubRepository, IWorkspaceIntegration } from "@plane/types";
// assets
import GithubLogo from "@/app/assets/logos/github-square.png?url";
import SlackLogo from "@/app/assets/services/slack.png?url";
// components
import { SelectChannel } from "@/components/integration/slack/select-channel";
import { SelectRepository } from "@/components/integration/github/select-repository";
// constants
import { PROJECT_GITHUB_REPOSITORY } from "@plane/constants";
// services
import { ProjectService } from "@/services/project";

type Props = {
  integration: IWorkspaceIntegration;
};

const integrationDetails: { [key: string]: any } = {
  github: {
    logo: GithubLogo,
    description: "Select GitHub repository to enable sync. Unlink anytime if this project does not need a repository.",
  },
  slack: {
    logo: SlackLogo,
    description: "Get regular updates and control which notification you want to receive.",
  },
};

// services
const projectService = new ProjectService();

export function IntegrationCard({ integration }: Props) {
  const { workspaceSlug, projectId } = useParams();

  const { data: syncedGithubRepository } = useSWR(projectId ? PROJECT_GITHUB_REPOSITORY(projectId) : null, () =>
    workspaceSlug && projectId && integration
      ? projectService.getProjectGithubRepository(workspaceSlug, projectId, integration.id)
      : null
  );

  const activeGithubSync =
    syncedGithubRepository && syncedGithubRepository.length > 0 ? syncedGithubRepository[0] : null;

  const handleChange = async (repo: IGithubRepository) => {
    if (!workspaceSlug || !projectId || !integration) return;

    const { id, name } = repo;
    const { login } = repo.owner;

    try {
      await projectService.syncGithubRepository(workspaceSlug, projectId, integration.id, {
        repository_id: id,
      });
      await mutate(PROJECT_GITHUB_REPOSITORY(projectId));

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: `${login}/${name} repository synced with the project successfully.`,
      });
    } catch (error) {
      console.error(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Repository could not be synced with the project. Please try again.",
      });
    }
  };

  const handleUnlink = async () => {
    if (!workspaceSlug || !projectId || !integration || !activeGithubSync) return;

    const repoLabel = `${activeGithubSync.repo_detail.owner}/${activeGithubSync.repo_detail.name}`;

    try {
      await projectService.unlinkGithubRepository(
        workspaceSlug.toString(),
        projectId.toString(),
        integration.id,
        activeGithubSync.id
      );
      await mutate(PROJECT_GITHUB_REPOSITORY(projectId));

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Unlinked",
        message: `${repoLabel} was unlinked from this project.`,
      });
    } catch (error) {
      console.error(error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Repository could not be unlinked from the project. Please try again.",
      });
    }
  };

  return (
    <>
      {integration && (
        <div className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 flex-shrink-0">
              <img
                src={integrationDetails[integration.integration_detail.provider].logo}
                className="h-full w-full object-cover"
                alt={`${integration.integration_detail.title} Logo`}
              />
            </div>
            <div>
              <h3 className="flex items-center gap-4 text-13 font-medium">{integration.integration_detail.title}</h3>
              <p className="text-13 tracking-tight text-secondary">
                {integrationDetails[integration.integration_detail.provider].description}
              </p>
            </div>
          </div>
          {integration.integration_detail.provider === "github" && (
            <div className="flex items-center gap-3">
              <SelectRepository
                integration={integration}
                value={activeGithubSync ? activeGithubSync.repo_detail.repository_id : null}
                label={
                  activeGithubSync
                    ? `${activeGithubSync.repo_detail.owner}/${activeGithubSync.repo_detail.name}`
                    : "Select Repository"
                }
                onChange={handleChange}
              />
              {activeGithubSync ? (
                <button type="button" className="shrink-0 text-13 text-danger-primary" onClick={handleUnlink}>
                  Unlink
                </button>
              ) : null}
            </div>
          )}
          {integration.integration_detail.provider === "slack" && <SelectChannel integration={integration} />}
        </div>
      )}
    </>
  );
}
