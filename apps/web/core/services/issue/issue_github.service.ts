/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TGithubInstallationRepositories,
  TIssueGithubBranch,
  TIssueGithubDevelopment,
  TIssueGithubPullRequest,
  TIssueGithubRemoteBranch,
  TIssueGithubRemotePullRequest,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class IssueGithubService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getDevelopment(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    params?: { include_commits?: boolean; branch_id?: string }
  ): Promise<TIssueGithubDevelopment> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      params: {
        include_commits: params?.include_commits ? "1" : undefined,
        branch_id: params?.branch_id,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listInstallationRepositories(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    q = ""
  ): Promise<TGithubInstallationRepositories> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      params: {
        list: "repositories",
        q: q || undefined,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listRepositoryBranches(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    repositoryId: string,
    q?: string
  ): Promise<{ branches: TIssueGithubRemoteBranch[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      params: {
        list: "branches",
        repository_id: repositoryId,
        q: q || undefined,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listRepositoryPullRequests(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    repositoryId: string,
    q?: string
  ): Promise<{ pull_requests: TIssueGithubRemotePullRequest[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      params: {
        list: "pull_requests",
        repository_id: repositoryId,
        q: q || undefined,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createBranch(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { repository_id: string; base_branch?: string; branch_name?: string }
  ): Promise<TIssueGithubBranch> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      action: "create_branch",
      ...data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkBranch(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { repository_id: string; branch_name: string }
  ): Promise<TIssueGithubBranch> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      action: "link_branch",
      ...data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkPullRequest(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { repository_id: string; number: number }
  ): Promise<TIssueGithubPullRequest> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      action: "link_pull_request",
      ...data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPullRequest(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: {
      repository_id: string;
      head_branch: string;
      base_branch?: string;
      title?: string;
      body?: string;
      draft?: boolean;
    }
  ): Promise<TIssueGithubPullRequest> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, {
      action: "create_pull_request",
      ...data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlink(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    entity: "branch" | "pull_request",
    id: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/github/`, undefined, {
      params: { entity, id },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
