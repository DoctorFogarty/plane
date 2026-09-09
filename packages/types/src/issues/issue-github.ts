/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TIssueGithubRepository = {
  id: string;
  name: string;
  owner: string;
  repository_id: number;
  url: string;
  project: string;
  config?: {
    default_branch?: string;
    full_name?: string;
    private?: boolean;
  };
};

export type TIssueGithubBranch = {
  id: string;
  name: string;
  head_sha: string;
  url: string;
  status: string;
  repository: string;
  repository_detail?: TIssueGithubRepository;
  issue: string;
  checkout_command?: string;
};

export type TIssueGithubPullRequest = {
  id: string;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  merged: boolean;
  html_url: string;
  head_branch: string;
  base_branch: string;
  repository: string;
  repository_detail?: TIssueGithubRepository;
  issue: string;
};

export type TIssueGithubCommit = {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
};

export type TIssueGithubRemoteBranch = {
  name: string;
  protected: boolean;
  commit_sha: string;
};

export type TIssueGithubRemotePullRequest = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  head_branch: string;
  base_branch: string;
};

export type TGithubInstallationRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch?: string;
  private?: boolean;
  owner?: {
    login?: string;
  };
};

export type TGithubInstallationRepositories = {
  total_count: number;
  repositories: TGithubInstallationRepository[];
};

export type TIssueGithubDevelopment = {
  github_connected?: boolean;
  repositories: TIssueGithubRepository[];
  branches: TIssueGithubBranch[];
  pull_requests: TIssueGithubPullRequest[];
  commits: TIssueGithubCommit[];
  commits_error?: string;
};

export type TConnectCodeMode = "create_branch" | "link_branch" | "link_pull_request" | "create_pull_request";
