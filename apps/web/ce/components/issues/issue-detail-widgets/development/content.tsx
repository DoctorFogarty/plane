/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { ExternalLink, GitBranch, GitPullRequest } from "lucide-react";
import { ISSUE_GITHUB_DEVELOPMENT } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueGithubBranch, TIssueGithubCommit, TIssueGithubDevelopment } from "@plane/types";
import { copyTextToClipboard } from "@plane/utils";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";
import { IssueGithubService } from "@/services/issue";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

const issueGithubService = new IssueGithubService();

async function unlinkEntity(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  entity: "branch" | "pull_request",
  id: string,
  successMessage: string
) {
  try {
    await issueGithubService.unlink(workspaceSlug, projectId, issueId, entity, id);
    mutate(ISSUE_GITHUB_DEVELOPMENT(issueId));
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Unlinked",
      message: successMessage,
    });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "error" in error
        ? String((error as { error?: string }).error)
        : "Could not unlink. Try again.";
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "Unlink failed",
      message,
    });
  }
}

function BranchRow({
  branch,
  workspaceSlug,
  projectId,
  issueId,
  disabled,
}: {
  branch: TIssueGithubBranch;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: commitData } = useSWR(
    expanded ? `${ISSUE_GITHUB_DEVELOPMENT(issueId)}_COMMITS_${branch.id}` : null,
    () =>
      issueGithubService.getDevelopment(workspaceSlug, projectId, issueId, {
        include_commits: true,
        branch_id: branch.id,
      })
  );
  const commits: TIssueGithubCommit[] = commitData?.commits || [];
  const commitsError = commitData?.commits_error;

  return (
    <div className="rounded border border-subtle px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-secondary" />
          <span className="truncate text-13 font-medium text-primary">{branch.name}</span>
          {branch.head_sha ? (
            <span className="font-mono shrink-0 text-11 text-tertiary">{branch.head_sha.slice(0, 7)}</span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="text-11 text-secondary hover:text-primary"
            onClick={() => {
              copyTextToClipboard(branch.name);
              setToast({
                type: TOAST_TYPE.SUCCESS,
                title: "Copied",
                message: "Branch name copied to clipboard",
              });
            }}
          >
            Copy name
          </button>
          {branch.url ? (
            <a
              href={branch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {!disabled ? (
            <button
              type="button"
              className="text-11 text-danger-primary"
              onClick={() =>
                unlinkEntity(
                  workspaceSlug,
                  projectId,
                  issueId,
                  "branch",
                  branch.id,
                  `${branch.name} was unlinked from this work item.`
                )
              }
            >
              Unlink
            </button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-1 border-t border-subtle pt-2">
          {commitsError ? (
            <p className="text-12 text-tertiary">{commitsError}</p>
          ) : commits.length === 0 ? (
            <p className="text-12 text-tertiary">No recent commits</p>
          ) : (
            commits.slice(0, 10).map((commit) => (
              <a
                key={commit.sha}
                href={commit.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-12 text-secondary hover:text-primary"
              >
                <span className="font-mono text-tertiary">{commit.sha.slice(0, 7)}</span>
                <span className="truncate">{commit.commit?.message?.split("\n")[0] || "Commit"}</span>
              </a>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function DevelopmentCollapsibleContent(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { data, isLoading } = useSWR(ISSUE_GITHUB_DEVELOPMENT(issueId), () =>
    issueGithubService.getDevelopment(workspaceSlug, projectId, issueId)
  );

  if (isLoading && !data) {
    return <p className="px-1 py-2 text-13 text-tertiary">Loading development…</p>;
  }

  const development: TIssueGithubDevelopment = data || {
    repositories: [],
    branches: [],
    pull_requests: [],
    commits: [],
  };

  if (development.repositories.length === 0 && development.branches.length === 0) {
    return (
      <div className="px-1 py-2">
        <p className="text-13 text-secondary">No branches yet</p>
        <a
          href={`/${workspaceSlug}/settings/projects/${projectId}/integrations`}
          className="mt-1 inline-block text-13 text-accent-primary hover:underline"
        >
          Link a repository in project settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-1 py-2">
      {development.branches.length > 0 ? (
        <div className="space-y-2">
          <p className="text-12 font-medium text-tertiary">Branches</p>
          {development.branches.map((branch) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              disabled={disabled}
            />
          ))}
        </div>
      ) : (
        <p className="text-13 text-secondary">No branches yet. Create or link a branch to start tracking commits.</p>
      )}

      <div className="space-y-2">
        <p className="text-12 font-medium text-tertiary">Pull requests</p>
        {development.pull_requests.length === 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-13 text-secondary">No pull requests yet</p>
            {!disabled ? (
              <button
                type="button"
                className="text-13 text-accent-primary hover:underline"
                onClick={() => connectCodeModalStore.open(issueId, "create_pull_request")}
              >
                Create pull request
              </button>
            ) : null}
          </div>
        ) : (
          development.pull_requests.map((pr) => (
            <div key={pr.id} className="flex items-center justify-between gap-2 rounded border border-subtle px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-secondary" />
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-13 font-medium text-primary hover:underline"
                >
                  #{pr.number} {pr.title}
                </a>
                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-11 text-secondary">
                  {pr.merged ? "merged" : pr.draft ? "draft" : pr.state}
                </span>
              </div>
              {!disabled ? (
                <button
                  type="button"
                  className="text-11 text-danger-primary"
                  onClick={() =>
                    unlinkEntity(
                      workspaceSlug,
                      projectId,
                      issueId,
                      "pull_request",
                      pr.id,
                      `#${pr.number} was unlinked from this work item.`
                    )
                  }
                >
                  Unlink
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
