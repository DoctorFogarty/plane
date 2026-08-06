# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.integration import (
    GithubRepositoryListEndpoint,
    GithubRepositorySyncEndpoint,
    GithubWebhookEndpoint,
    IntegrationListEndpoint,
    IssueGithubDevelopmentEndpoint,
    WorkspaceIntegrationDeleteEndpoint,
    WorkspaceIntegrationEndpoint,
)

urlpatterns = [
    path("integrations/", IntegrationListEndpoint.as_view(), name="integrations"),
    path(
        "workspaces/<str:slug>/workspace-integrations/",
        WorkspaceIntegrationEndpoint.as_view(),
        name="workspace-integrations",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<str:provider>/",
        WorkspaceIntegrationEndpoint.as_view(),
        name="workspace-integrations-provider",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<uuid:pk>/provider/",
        WorkspaceIntegrationDeleteEndpoint.as_view(),
        name="workspace-integrations-delete",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<uuid:workspace_integration_id>/github-repositories/",
        GithubRepositoryListEndpoint.as_view(),
        name="github-repositories",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workspace-integrations/<uuid:workspace_integration_id>/github-repository-sync/",
        GithubRepositorySyncEndpoint.as_view(),
        name="github-repository-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workspace-integrations/<uuid:workspace_integration_id>/github-repository-sync/<uuid:pk>/",
        GithubRepositorySyncEndpoint.as_view(),
        name="github-repository-sync-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/github/",
        IssueGithubDevelopmentEndpoint.as_view(),
        name="issue-github-development",
    ),
    path(
        "hooks/github/",
        GithubWebhookEndpoint.as_view(),
        name="github-webhook",
    ),
]
