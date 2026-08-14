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
    SlackAuditLogEndpoint,
    SlackChannelListEndpoint,
    SlackChannelSubscriptionDetailEndpoint,
    SlackChannelSubscriptionEndpoint,
    SlackCommandsEndpoint,
    SlackConnectionEndpoint,
    SlackEventsEndpoint,
    SlackInteractiveEndpoint,
    SlackUserConnectionEndpoint,
    SlackUserOAuthCallbackEndpoint,
    SlackUserOAuthInstallEndpoint,
    SlackWorkspaceOAuthCallbackEndpoint,
    SlackWorkspaceOAuthInstallEndpoint,
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
    path("hooks/slack/events", SlackEventsEndpoint.as_view(), name="slack-events"),
    path("hooks/slack/interactive", SlackInteractiveEndpoint.as_view(), name="slack-interactive"),
    path("hooks/slack/commands", SlackCommandsEndpoint.as_view(), name="slack-commands"),
    path(
        "hooks/slack/oauth/workspace",
        SlackWorkspaceOAuthCallbackEndpoint.as_view(),
        name="slack-oauth-workspace",
    ),
    path(
        "hooks/slack/oauth/user",
        SlackUserOAuthCallbackEndpoint.as_view(),
        name="slack-oauth-user",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/install/",
        SlackWorkspaceOAuthInstallEndpoint.as_view(),
        name="slack-install",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/connect-user/",
        SlackUserOAuthInstallEndpoint.as_view(),
        name="slack-connect-user",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/connection/",
        SlackConnectionEndpoint.as_view(),
        name="slack-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/me/",
        SlackUserConnectionEndpoint.as_view(),
        name="slack-user-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/channels/",
        SlackChannelListEndpoint.as_view(),
        name="slack-channels",
    ),
    path(
        "workspaces/<str:slug>/integrations/slack/audit-logs/",
        SlackAuditLogEndpoint.as_view(),
        name="slack-audit-logs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/slack-channel-subscriptions/",
        SlackChannelSubscriptionEndpoint.as_view(),
        name="slack-channel-subscriptions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/slack-channel-subscriptions/<uuid:pk>/",
        SlackChannelSubscriptionDetailEndpoint.as_view(),
        name="slack-channel-subscription-detail",
    ),
]
