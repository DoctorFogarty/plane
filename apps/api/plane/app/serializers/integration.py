# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import (
    GithubRepository,
    GithubRepositorySync,
    Integration,
    IssueGithubBranch,
    IssueGithubPullRequest,
    WorkspaceIntegration,
)


class IntegrationSerializer(BaseSerializer):
    class Meta:
        model = Integration
        fields = "__all__"


class WorkspaceIntegrationSerializer(BaseSerializer):
    integration_detail = IntegrationSerializer(read_only=True, source="integration")

    class Meta:
        model = WorkspaceIntegration
        fields = "__all__"


class GithubRepositorySerializer(BaseSerializer):
    class Meta:
        model = GithubRepository
        fields = "__all__"


class GithubRepositorySyncSerializer(BaseSerializer):
    repo_detail = GithubRepositorySerializer(read_only=True, source="repository")

    class Meta:
        model = GithubRepositorySync
        fields = "__all__"


class IssueGithubBranchSerializer(BaseSerializer):
    repository_detail = GithubRepositorySerializer(read_only=True, source="repository")

    class Meta:
        model = IssueGithubBranch
        fields = "__all__"
        read_only_fields = ["issue", "project", "workspace"]


class IssueGithubPullRequestSerializer(BaseSerializer):
    repository_detail = GithubRepositorySerializer(read_only=True, source="repository")

    class Meta:
        model = IssueGithubPullRequest
        fields = "__all__"
        read_only_fields = ["issue", "project", "workspace"]
