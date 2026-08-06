/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { useParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import type { IGithubRepository, IWorkspaceIntegration } from "@plane/types";
// ui
import { CustomSearchSelect } from "@plane/ui";
// helpers
import { truncateText } from "@plane/utils";
import { ProjectService } from "@/services/project";

type Props = {
  integration: IWorkspaceIntegration;
  value: number | null;
  label: string | React.ReactNode;
  onChange: (repo: IGithubRepository) => void;
  characterLimit?: number;
};

const projectService = new ProjectService();

export function SelectRepository(props: Props) {
  const { integration, value, label, onChange, characterLimit = 25 } = props;
  const { workspaceSlug } = useParams();

  const getKey = (pageIndex: number) => {
    if (!workspaceSlug || !integration) return;

    return `${process.env.VITE_API_BASE_URL}/api/workspaces/${workspaceSlug}/workspace-integrations/${
      integration.id
    }/github-repositories/?page=${++pageIndex}`;
  };

  const fetchGithubRepos = async (url: string) => {
    const data = await projectService.getGithubRepositories(url);
    return data;
  };

  const {
    data: paginatedData,
    size,
    setSize,
    isValidating,
    isLoading,
    error,
  } = useSWRInfinite(getKey, fetchGithubRepos);

  const userRepositories = (paginatedData ?? []).flatMap((data) =>
    data.repositories.filter((repository) => repository.id > 0)
  );

  const totalCount = paginatedData && paginatedData.length > 0 ? paginatedData[0].total_count : 0;
  const apiError =
    (error as { data?: { error?: string }; message?: string } | undefined)?.data?.error ||
    (error as { message?: string } | undefined)?.message;

  const options =
    userRepositories.map((repo) => ({
      value: repo.id,
      query: repo.full_name,
      content: <p>{truncateText(repo.full_name, characterLimit)}</p>,
    })) ?? [];

  if (isLoading && userRepositories.length < 1) {
    return <p className="text-sm text-secondary">Loading repositories…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-danger-primary">
        {apiError || "Could not load GitHub repositories. Reinstall the GitHub App or check God Mode configuration."}
      </p>
    );
  }

  if (userRepositories.length < 1) {
    return (
      <div className="text-sm max-w-sm text-secondary">
        <p>No repositories granted to this GitHub App installation.</p>
        <p className="mt-1">
          Open the{" "}
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noreferrer"
            className="text-accent-primary hover:underline"
          >
            GitHub App installation settings
          </a>{" "}
          and grant access to All repositories or selected repos, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <CustomSearchSelect
      value={value}
      options={options}
      onChange={(val: number) => {
        const selectedRepository = userRepositories.find((repository) => repository.id === val);
        if (selectedRepository) onChange(selectedRepository);
      }}
      label={label}
      footerOption={
        <>
          {userRepositories && options.length < totalCount && (
            <button
              type="button"
              className="w-full p-1 text-center text-10 text-secondary hover:bg-layer-1"
              onClick={() => setSize(size + 1)}
              disabled={isValidating}
            >
              {isValidating ? "Loading..." : "Click to load more..."}
            </button>
          )}
        </>
      }
      optionsClassName="w-48"
    />
  );
}
