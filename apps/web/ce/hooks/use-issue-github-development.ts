/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { ISSUE_GITHUB_DEVELOPMENT } from "@plane/constants";
import type { TIssueGithubDevelopment } from "@plane/types";
import { IssueGithubService } from "@/services/issue";

const issueGithubService = new IssueGithubService();

export const EMPTY_GITHUB_REPOSITORIES: TIssueGithubDevelopment["repositories"] = [];

export function useIssueGithubDevelopment(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  enabled = true
) {
  const key = enabled && workspaceSlug && projectId && issueId ? ISSUE_GITHUB_DEVELOPMENT(issueId) : null;

  return useSWR(key, () => issueGithubService.getDevelopment(workspaceSlug!, projectId!, issueId!), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}
