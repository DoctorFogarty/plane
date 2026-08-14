/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueServiceType } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";

function slugifyTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function useDefaultGithubBranchName(
  issueServiceType: TIssueServiceType,
  projectId: string,
  workItemId: string
): string {
  const {
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);
  const { getProjectById } = useProject();
  const issue = getIssueById(workItemId);
  const project = getProjectById(projectId);

  if (!project || !issue) return "";
  return `${project.identifier}-${issue.sequence_id}-${slugifyTitle(issue.name || "")}`.replace(/-$/, "");
}

export function useDefaultGithubPullRequestCopy(
  issueServiceType: TIssueServiceType,
  projectId: string,
  workItemId: string,
  workspaceSlug: string
): { title: string; body: string } {
  const {
    issue: { getIssueById },
  } = useIssueDetail(issueServiceType);
  const { getProjectById } = useProject();
  const issue = getIssueById(workItemId);
  const project = getProjectById(projectId);

  if (!project || !issue) return { title: "", body: "" };
  const identifier = `${project.identifier}-${issue.sequence_id}`;
  const title = issue.name ? `${identifier} ${issue.name}` : identifier;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const body = `${identifier}\n\n${origin}/${workspaceSlug}/projects/${projectId}/issues/${workItemId}`;
  return { title, body };
}
