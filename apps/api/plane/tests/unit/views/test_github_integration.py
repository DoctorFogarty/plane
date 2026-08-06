# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.integration.base import (
    GithubRepositoryListEndpoint,
    GithubRepositorySyncEndpoint,
)
from plane.db.models import (
    APIToken,
    GithubRepository,
    GithubRepositorySync,
    Integration,
    Project,
    ProjectMember,
    User,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.utils.github import GitHubAPIError


@pytest.fixture
def github_integration_context(db, create_user):
    workspace = Workspace.objects.create(
        name="GitHub integration workspace",
        slug="github-integration-workspace",
        owner=create_user,
    )
    WorkspaceMember.objects.create(
        workspace=workspace,
        member=create_user,
        role=20,
    )
    project = Project.objects.create(
        name="GitHub integration project",
        identifier="GHI",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=20,
    )
    integration = Integration.objects.create(
        title="GitHub",
        provider="github",
        verified=True,
    )
    bot = User.objects.create(
        email="github-integration-bot@plane.so",
        username="github-integration-bot",
        is_bot=True,
    )
    token = APIToken.objects.create(
        user=bot,
        user_type=1,
        workspace=workspace,
        is_service=True,
    )
    workspace_integration = WorkspaceIntegration.objects.create(
        workspace=workspace,
        integration=integration,
        actor=bot,
        api_token=token,
        config={"installation_id": "123"},
    )
    repository = GithubRepository.objects.create(
        project=project,
        name="old-repository",
        owner="plane",
        repository_id=101,
        url="https://github.com/plane/old-repository",
    )
    sync = GithubRepositorySync.objects.create(
        project=project,
        repository=repository,
        actor=bot,
        workspace_integration=workspace_integration,
        credentials={"installation_id": "123"},
    )
    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "workspace_integration": workspace_integration,
        "repository": repository,
        "sync": sync,
    }


def _canonical_repository(repository_id=202):
    return {
        "id": repository_id,
        "name": "canonical-repository",
        "full_name": "makeplane/canonical-repository",
        "html_url": "https://github.com/makeplane/canonical-repository",
        "default_branch": "develop",
        "private": True,
        "owner": {"login": "makeplane"},
    }


@pytest.mark.unit
class TestGithubRepositoryListEndpoint:
    @pytest.mark.parametrize("page", ["", "invalid", "0", "-1"])
    def test_rejects_invalid_page_without_calling_github(
        self,
        github_integration_context,
        page,
    ):
        ctx = github_integration_context
        request = APIRequestFactory().get(
            f"/api/workspaces/{ctx['workspace'].slug}/workspace-integrations/"
            f"{ctx['workspace_integration'].id}/github-repositories/?page={page}"
        )
        force_authenticate(request, user=ctx["user"])

        with patch("plane.app.views.integration.base.GitHubAppClient") as client:
            response = GithubRepositoryListEndpoint.as_view()(
                request,
                slug=ctx["workspace"].slug,
                workspace_integration_id=str(ctx["workspace_integration"].id),
            )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "page must be a positive integer"}
        client.assert_not_called()


@pytest.mark.unit
class TestGithubRepositorySyncEndpoint:
    def _post(self, ctx, repository_id):
        request = APIRequestFactory().post(
            f"/api/workspaces/{ctx['workspace'].slug}/projects/{ctx['project'].id}/"
            f"workspace-integrations/{ctx['workspace_integration'].id}/github-repository-sync/",
            {"repository_id": repository_id},
            format="json",
        )
        force_authenticate(request, user=ctx["user"])
        return GithubRepositorySyncEndpoint.as_view()(
            request,
            slug=ctx["workspace"].slug,
            project_id=str(ctx["project"].id),
            workspace_integration_id=str(ctx["workspace_integration"].id),
        )

    def test_invalid_repository_id_preserves_existing_sync(
        self,
        github_integration_context,
    ):
        ctx = github_integration_context

        response = self._post(ctx, "not-a-number")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert GithubRepositorySync.objects.get(project=ctx["project"]).id == ctx["sync"].id

    def test_replacement_uses_canonical_github_metadata(
        self,
        github_integration_context,
    ):
        ctx = github_integration_context
        with patch("plane.app.views.integration.base.GitHubAppClient") as client_class:
            client_class.return_value.get_repository_by_id.return_value = _canonical_repository()
            response = self._post(ctx, 202)

        assert response.status_code == status.HTTP_201_CREATED
        client_class.assert_called_once_with(installation_id="123")
        client_class.return_value.get_repository_by_id.assert_called_once_with(202)

        sync = GithubRepositorySync.objects.select_related("repository").get(project=ctx["project"])
        assert sync.repository.repository_id == 202
        assert sync.repository.owner == "makeplane"
        assert sync.repository.name == "canonical-repository"
        assert sync.repository.url == "https://github.com/makeplane/canonical-repository"
        assert sync.repository.config == {
            "default_branch": "develop",
            "full_name": "makeplane/canonical-repository",
            "private": True,
        }
        assert GithubRepositorySync.all_objects.get(pk=ctx["sync"].id).deleted_at is not None

    def test_github_failure_preserves_existing_sync(
        self,
        github_integration_context,
    ):
        ctx = github_integration_context
        with patch("plane.app.views.integration.base.GitHubAppClient") as client_class:
            client_class.return_value.get_repository_by_id.side_effect = GitHubAPIError(
                "not found",
                status_code=404,
                response="missing",
            )
            response = self._post(ctx, 202)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Repository is not accessible to this GitHub App installation"
        assert GithubRepositorySync.objects.get(project=ctx["project"]).id == ctx["sync"].id

    def test_database_failure_rolls_back_replacement(
        self,
        github_integration_context,
    ):
        ctx = github_integration_context
        with (
            patch("plane.app.views.integration.base.GitHubAppClient") as client_class,
            patch.object(
                GithubRepositorySync.objects,
                "create",
                side_effect=RuntimeError("database write failed"),
            ),
        ):
            client_class.return_value.get_repository_by_id.return_value = _canonical_repository()
            response = self._post(ctx, 202)

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert GithubRepositorySync.objects.get(project=ctx["project"]).id == ctx["sync"].id
        assert GithubRepository.objects.filter(project=ctx["project"]).count() == 1

    def test_delete_uses_soft_delete_count(
        self,
        github_integration_context,
    ):
        ctx = github_integration_context
        request = APIRequestFactory().delete(
            f"/api/workspaces/{ctx['workspace'].slug}/projects/{ctx['project'].id}/"
            f"workspace-integrations/{ctx['workspace_integration'].id}/github-repository-sync/"
        )
        force_authenticate(request, user=ctx["user"])

        response = GithubRepositorySyncEndpoint.as_view()(
            request,
            slug=ctx["workspace"].slug,
            project_id=str(ctx["project"].id),
            workspace_integration_id=str(ctx["workspace_integration"].id),
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not GithubRepositorySync.objects.filter(project=ctx["project"]).exists()
