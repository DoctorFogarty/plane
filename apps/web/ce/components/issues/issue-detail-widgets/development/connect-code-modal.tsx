/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import useSWR, { mutate } from "swr";
import { ISSUE_GITHUB_DEVELOPMENT } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TConnectCodeMode,
  TIssueGithubBranch,
  TIssueGithubPullRequest,
  TIssueGithubRepository,
} from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { copyTextToClipboard, cn } from "@plane/utils";
import { EMPTY_GITHUB_REPOSITORIES } from "@/plane-web/hooks/use-issue-github-development";
import { IssueGithubService } from "@/services/issue";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: TConnectCodeMode;
  onModeChange: (mode: TConnectCodeMode) => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  repositories: TIssueGithubRepository[];
  isRepositoriesLoading: boolean;
  repositoriesError?: boolean;
  defaultBranchName: string;
};

const issueGithubService = new IssueGithubService();

const MODE_LABELS: Record<TConnectCodeMode, string> = {
  create_branch: "Create branch",
  link_branch: "Link branch",
  link_pull_request: "Link pull request",
};

export function ConnectCodeModal(props: Props) {
  const {
    isOpen,
    onClose,
    mode,
    onModeChange,
    workspaceSlug,
    projectId,
    issueId,
    repositories,
    isRepositoriesLoading,
    repositoriesError,
    defaultBranchName,
  } = props;

  const [repositoryId, setRepositoryId] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [branchName, setBranchName] = useState(defaultBranchName);
  const [prNumber, setPrNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<TIssueGithubBranch | null>(null);
  const [linkedPr, setLinkedPr] = useState<TIssueGithubPullRequest | null>(null);
  const ignoreCloseRef = useRef(false);

  const repos = repositories.length > 0 ? repositories : EMPTY_GITHUB_REPOSITORIES;

  const {
    data: remoteBranches,
    error: branchesError,
    isLoading: isBranchesLoading,
    mutate: retryBranches,
  } = useSWR(
    isOpen && (mode === "link_branch" || mode === "create_branch") && repositoryId
      ? `ISSUE_GITHUB_REMOTE_BRANCHES_${issueId}_${repositoryId}`
      : null,
    () => issueGithubService.listRepositoryBranches(workspaceSlug, projectId, issueId, repositoryId),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const {
    data: remotePrs,
    error: pullRequestsError,
    isLoading: isPrsLoading,
    mutate: retryPullRequests,
  } = useSWR(
    isOpen && mode === "link_pull_request" && repositoryId
      ? `ISSUE_GITHUB_REMOTE_PRS_${issueId}_${repositoryId}`
      : null,
    () => issueGithubService.listRepositoryPullRequests(workspaceSlug, projectId, issueId, repositoryId),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    setLinkedPr(null);
    setBranchName(defaultBranchName);
    setBaseBranch("main");
    setPrNumber("");
    setRepositoryId(repositories[0]?.id || "");
    ignoreCloseRef.current = false;
    // Reset when modal opens, mode changes, or first repo becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally key off first repo id
  }, [defaultBranchName, isOpen, mode, repositories[0]?.id]);

  useEffect(() => {
    if (!isOpen || mode !== "create_branch") return;
    const branches = remoteBranches?.branches;
    if (!branches?.length) return;
    const names = branches.map((branch) => branch.name);
    setBaseBranch((current) => {
      if (current && names.includes(current)) return current;
      if (names.includes("main")) return "main";
      return names[0] ?? "";
    });
  }, [isOpen, mode, remoteBranches, repositoryId]);

  const handleClose = () => {
    if (ignoreCloseRef.current || isSubmitting) return;
    onClose();
  };

  const withSubmitGuard = async (fn: () => Promise<void>) => {
    ignoreCloseRef.current = true;
    setIsSubmitting(true);
    try {
      await fn();
    } finally {
      setIsSubmitting(false);
      // Allow Headless UI to settle after toast mount before accepting dismiss again
      window.setTimeout(() => {
        ignoreCloseRef.current = false;
      }, 300);
    }
  };

  const handleCreate = async () => {
    if (!repositoryId) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Repository required",
        message: "Select a repository to create a branch.",
      });
      return;
    }
    if (!baseBranch.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Base branch required",
        message: "Select a base branch.",
      });
      return;
    }
    if (!branchName.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Branch name required",
        message: "Enter a branch name.",
      });
      return;
    }

    await withSubmitGuard(async () => {
      try {
        const result = await issueGithubService.createBranch(workspaceSlug, projectId, issueId, {
          repository_id: repositoryId,
          base_branch: baseBranch.trim(),
          branch_name: branchName.trim(),
        });
        setCreated(result);
        mutate(ISSUE_GITHUB_DEVELOPMENT(issueId));
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Branch created",
          message: `${result.name} is ready on GitHub.`,
        });
      } catch (error: unknown) {
        const message =
          error && typeof error === "object" && "error" in error
            ? String((error as { error?: string }).error)
            : "Try a different branch name or check the linked repository.";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not create branch",
          message,
        });
      }
    });
  };

  const handleLinkBranch = async () => {
    if (!repositoryId) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Repository required",
        message: "Select a repository to link a branch.",
      });
      return;
    }
    if (!branchName.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Branch name required",
        message: "Select or enter a branch name.",
      });
      return;
    }

    await withSubmitGuard(async () => {
      try {
        const result = await issueGithubService.linkBranch(workspaceSlug, projectId, issueId, {
          repository_id: repositoryId,
          branch_name: branchName.trim(),
        });
        setCreated(result);
        mutate(ISSUE_GITHUB_DEVELOPMENT(issueId));
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Branch linked",
          message: `${result.name} is linked to this work item.`,
        });
      } catch (error: unknown) {
        const message =
          error && typeof error === "object" && "error" in error
            ? String((error as { error?: string }).error)
            : "Check the branch name and try again.";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not link branch",
          message,
        });
      }
    });
  };

  const handleLinkPr = async () => {
    if (!repositoryId) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Repository required",
        message: "Select a repository to link a pull request.",
      });
      return;
    }
    const number = Number.parseInt(prNumber, 10);
    if (!number || Number.isNaN(number)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "PR number required",
        message: "Select a pull request or enter its number.",
      });
      return;
    }

    await withSubmitGuard(async () => {
      try {
        const result = await issueGithubService.linkPullRequest(workspaceSlug, projectId, issueId, {
          repository_id: repositoryId,
          number,
        });
        setLinkedPr(result);
        mutate(ISSUE_GITHUB_DEVELOPMENT(issueId));
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Pull request linked",
          message: `#${result.number} is linked to this work item.`,
        });
      } catch (error: unknown) {
        const message =
          error && typeof error === "object" && "error" in error
            ? String((error as { error?: string }).error)
            : "Check the pull request number and try again.";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not link pull request",
          message,
        });
      }
    });
  };

  const checkoutCommand =
    created?.checkout_command || (created ? `git fetch origin ${created.name} && git checkout ${created.name}` : "");

  const showSuccess = Boolean(created || linkedPr);
  const title = linkedPr
    ? "Pull request linked"
    : created
      ? mode === "create_branch"
        ? "Branch created"
        : "Branch linked"
      : "Connect code";

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="space-y-5 p-5">
        <div className="space-y-3">
          <Dialog.Title as="h3" className="text-h4-medium text-primary">
            {title}
          </Dialog.Title>
          {!showSuccess ? (
            <div className="flex flex-wrap gap-1 rounded-md border border-subtle bg-surface-2 p-1">
              {(Object.keys(MODE_LABELS) as TConnectCodeMode[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "rounded px-2.5 py-1.5 text-13 transition-colors",
                    mode === key
                      ? "shadow-sm bg-surface-1 font-medium text-primary"
                      : "text-secondary hover:text-primary"
                  )}
                  onClick={() => onModeChange(key)}
                  aria-pressed={mode === key}
                >
                  {MODE_LABELS[key]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {linkedPr ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              <span className="font-medium text-primary">
                #{linkedPr.number} {linkedPr.title}
              </span>{" "}
              is linked.
            </p>
            {linkedPr.html_url ? (
              <a
                href={linkedPr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-primary hover:underline"
              >
                Open pull request on GitHub
              </a>
            ) : null}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : created ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              <span className="font-medium text-primary">{created.name}</span> is on GitHub.
            </p>
            {mode === "create_branch" && checkoutCommand ? (
              <div>
                <p className="text-sm mb-1 block text-secondary">Copy checkout command</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 text-primary">
                    {checkoutCommand}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      copyTextToClipboard(checkoutCommand);
                      setToast({
                        type: TOAST_TYPE.SUCCESS,
                        title: "Copied",
                        message: "Checkout command copied to clipboard.",
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            ) : null}
            {created.url ? (
              <a
                href={created.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-primary hover:underline"
              >
                Open branch on GitHub
              </a>
            ) : null}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : isRepositoriesLoading && repos.length === 0 ? (
          <div className="space-y-3">
            <div className="h-9 animate-pulse rounded bg-surface-2" />
            <div className="h-9 animate-pulse rounded bg-surface-2" />
            <div className="h-9 animate-pulse rounded bg-surface-2" />
          </div>
        ) : repositoriesError ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary">Could not load GitHub repositories. Try again.</p>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : repos.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary">No repositories linked. Link a repository in project settings.</p>
            <a
              href={`/${workspaceSlug}/settings/projects/${projectId}/integrations`}
              className="text-sm text-accent-primary hover:underline"
            >
              Open project integrations
            </a>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor={`connect-code-repository-${issueId}`} className="text-sm mb-1 block text-secondary">
                Repository
              </label>
              <select
                id={`connect-code-repository-${issueId}`}
                className="text-sm focus:ring-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary focus:ring-1 focus:outline-none"
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
              >
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.owner}/{repo.name}
                  </option>
                ))}
              </select>
            </div>

            {mode === "create_branch" ? (
              <>
                <div>
                  <label htmlFor={`connect-code-base-branch-${issueId}`} className="text-sm mb-1 block text-secondary">
                    Base branch
                  </label>
                  {isBranchesLoading ? (
                    <div className="h-9 animate-pulse rounded bg-surface-2" />
                  ) : branchesError ? (
                    <div className="flex items-center justify-between gap-3 rounded border border-danger-subtle bg-danger-subtle px-3 py-2">
                      <p className="text-12 text-danger-primary">Could not load branches from GitHub.</p>
                      <Button variant="secondary" size="sm" onClick={() => void retryBranches()}>
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <select
                      id={`connect-code-base-branch-${issueId}`}
                      className="text-sm focus:ring-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary focus:ring-1 focus:outline-none"
                      value={remoteBranches?.branches?.some((b) => b.name === baseBranch) ? baseBranch : ""}
                      onChange={(e) => setBaseBranch(e.target.value)}
                    >
                      <option value="">Select a base branch</option>
                      {(remoteBranches?.branches || []).map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor={`connect-code-branch-name-${issueId}`} className="text-sm mb-1 block text-secondary">
                    Branch name
                  </label>
                  <Input
                    id={`connect-code-branch-name-${issueId}`}
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder={defaultBranchName}
                  />
                </div>
              </>
            ) : null}

            {mode === "link_branch" ? (
              <>
                <div>
                  <label
                    htmlFor={`connect-code-remote-branch-${issueId}`}
                    className="text-sm mb-1 block text-secondary"
                  >
                    Branch
                  </label>
                  {isBranchesLoading ? (
                    <div className="h-9 animate-pulse rounded bg-surface-2" />
                  ) : branchesError ? (
                    <div className="flex items-center justify-between gap-3 rounded border border-danger-subtle bg-danger-subtle px-3 py-2">
                      <p className="text-12 text-danger-primary">Could not load branches from GitHub.</p>
                      <Button variant="secondary" size="sm" onClick={() => void retryBranches()}>
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <select
                      id={`connect-code-remote-branch-${issueId}`}
                      className="text-sm focus:ring-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary focus:ring-1 focus:outline-none"
                      value={remoteBranches?.branches?.some((b) => b.name === branchName) ? branchName : ""}
                      onChange={(e) => {
                        if (e.target.value) setBranchName(e.target.value);
                      }}
                    >
                      <option value="">Select a branch</option>
                      {(remoteBranches?.branches || []).map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label
                    htmlFor={`connect-code-manual-branch-${issueId}`}
                    className="text-sm mb-1 block text-secondary"
                  >
                    Or enter branch name
                  </label>
                  <Input
                    id={`connect-code-manual-branch-${issueId}`}
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="feature/my-branch"
                  />
                </div>
              </>
            ) : null}

            {mode === "link_pull_request" ? (
              <>
                <div>
                  <label htmlFor={`connect-code-pull-request-${issueId}`} className="text-sm mb-1 block text-secondary">
                    Open pull requests
                  </label>
                  {isPrsLoading ? (
                    <div className="h-9 animate-pulse rounded bg-surface-2" />
                  ) : pullRequestsError ? (
                    <div className="flex items-center justify-between gap-3 rounded border border-danger-subtle bg-danger-subtle px-3 py-2">
                      <p className="text-12 text-danger-primary">Could not load pull requests from GitHub.</p>
                      <Button variant="secondary" size="sm" onClick={() => void retryPullRequests()}>
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <select
                      id={`connect-code-pull-request-${issueId}`}
                      className="text-sm focus:ring-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-primary focus:ring-1 focus:outline-none"
                      value={prNumber}
                      onChange={(e) => setPrNumber(e.target.value)}
                    >
                      <option value="">Select a pull request</option>
                      {(remotePrs?.pull_requests || []).map((pr) => (
                        <option key={pr.number} value={String(pr.number)}>
                          #{pr.number} {pr.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor={`connect-code-pr-number-${issueId}`} className="text-sm mb-1 block text-secondary">
                    Or enter PR number
                  </label>
                  <Input
                    id={`connect-code-pr-number-${issueId}`}
                    value={prNumber}
                    onChange={(e) => setPrNumber(e.target.value)}
                    placeholder="42"
                    type="number"
                    min={1}
                  />
                </div>
              </>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              {mode === "create_branch" ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreate}
                  loading={isSubmitting}
                  disabled={isBranchesLoading || Boolean(branchesError) || !baseBranch.trim()}
                >
                  Create branch
                </Button>
              ) : null}
              {mode === "link_branch" ? (
                <Button variant="primary" size="sm" onClick={handleLinkBranch} loading={isSubmitting}>
                  Link branch
                </Button>
              ) : null}
              {mode === "link_pull_request" ? (
                <Button variant="primary" size="sm" onClick={handleLinkPr} loading={isSubmitting}>
                  Link pull request
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </ModalCore>
  );
}
