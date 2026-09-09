# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import MagicMock, patch

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from plane.app.views.integration.github_issue import (
    IssueGithubDevelopmentEndpoint,
    _installation_id_for_project,
    _pull_request_create_error_message,
    _resolve_repository,
    _slim_branch,
    _slim_pull_request,
)
from plane.db.models import (
    APIToken,
    GithubRepository,
    GithubRepositorySync,
    Integration,
    Issue,
    IssueGithubBranch,
    IssueGithubPullRequest,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.utils.github import GitHubAPIError, GitHubAppClient


def _github_repository_payload(repo=None, **overrides):
    owner = getattr(repo, "owner", "makeplane")
    name = getattr(repo, "name", "plane")
    payload = {
        "id": getattr(repo, "repository_id", 999002),
        "name": name,
        "html_url": getattr(repo, "url", None) or f"https://github.com/{owner}/{name}",
        "default_branch": "main",
        "full_name": f"{owner}/{name}",
        "private": False,
        "owner": {"login": owner},
    }
    payload.update(overrides)
    return payload


def _attach_repository_lookup(mock_client, repo=None, **overrides):
    mock_client.get_repository_by_id.return_value = _github_repository_payload(repo, **overrides)
    return mock_client


@pytest.fixture
def github_dev_context(db, create_user):
    workspace = Workspace.objects.create(name="WS", slug="gh-link-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Project",
        identifier="PROJ",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    issue = Issue.objects.create(
        name="Test issue",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )
    issue.sequence_id = 12
    issue.save(update_fields=["sequence_id"])

    integration = Integration.objects.create(title="GitHub", provider="github", verified=True)
    bot = User.objects.create(email="gh-link-bot@plane.so", username="gh-link-bot", is_bot=True)
    token = APIToken.objects.create(user=bot, user_type=1, workspace=workspace, is_service=True)
    wi = WorkspaceIntegration.objects.create(
        workspace=workspace,
        integration=integration,
        actor=bot,
        api_token=token,
        config={
            "installation_id": "123",
            "account_login": "makeplane",
            "account_type": "Organization",
        },
    )
    repo = GithubRepository.objects.create(
        project=project,
        name="plane",
        owner="makeplane",
        repository_id=999002,
        url="https://github.com/makeplane/plane",
    )
    GithubRepositorySync.objects.create(
        project=project,
        repository=repo,
        actor=bot,
        workspace_integration=wi,
        credentials={"installation_id": "123"},
    )
    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "issue": issue,
        "repo": repo,
    }


@pytest.mark.unit
class TestGithubClientListMethods:
    def test_list_branches_calls_api(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request", return_value=[{"name": "main", "protected": True}]) as mock_req:
            result = client.list_branches("owner", "repo", per_page=50)
        mock_req.assert_called_once_with("GET", "/repos/owner/repo/branches?per_page=50")
        assert result[0]["name"] == "main"

    def test_list_pull_requests_calls_api(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request", return_value=[{"number": 7, "title": "Fix"}]) as mock_req:
            result = client.list_pull_requests("owner", "repo", state="open", per_page=10)
        mock_req.assert_called_once_with("GET", "/repos/owner/repo/pulls?state=open&per_page=10")
        assert result[0]["number"] == 7

    def test_create_pull_request_calls_api(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request", return_value={"number": 9}) as mock_req:
            result = client.create_pull_request(
                "makeplane",
                "plane",
                "PROJ-12 Add login",
                "feature/login",
                "main",
                body="PROJ-12",
                draft=True,
            )
        mock_req.assert_called_once_with(
            "POST",
            "/repos/makeplane/plane/pulls",
            json={
                "title": "PROJ-12 Add login",
                "head": "feature/login",
                "base": "main",
                "body": "PROJ-12",
                "draft": True,
            },
        )
        assert result["number"] == 9

    def test_list_methods_return_empty_on_none(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request", return_value=None):
            assert client.list_branches("o", "r") == []
            assert client.list_pull_requests("o", "r") == []

    def test_list_account_repositories_sorts_by_pushed(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request", return_value=[{"id": 1, "name": "plane"}]) as mock_req:
            result = client.list_account_repositories("makeplane", "Organization", per_page=100)
        mock_req.assert_called_once_with(
            "GET",
            "/orgs/makeplane/repos?sort=pushed&direction=desc&per_page=100",
        )
        assert result["total_count"] == 1
        assert result["repositories"][0]["name"] == "plane"

    def test_search_account_repositories_scopes_and_sanitizes(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(
            client,
            "request",
            return_value={"total_count": 1, "items": [{"id": 456, "name": "website"}]},
        ) as mock_req:
            result = client.search_account_repositories(
                "makeplane",
                "Organization",
                "org:evil website",
            )
        path = mock_req.call_args[0][1]
        assert "sort=updated" in path
        assert "org%3Amakeplane" in path or "org:makeplane" in path
        assert "website" in path
        assert "evil" not in path
        assert result["repositories"][0]["id"] == 456

    def test_search_account_repositories_skips_empty_sanitized_query(self):
        with patch(
            "plane.utils.github.client._get_github_app_config",
            return_value={
                "app_id": "1",
                "private_key": "",
                "client_id": "",
                "client_secret": "",
                "webhook_secret": "",
                "app_name": "test",
            },
        ):
            client = GitHubAppClient(installation_id="1")
        with patch.object(client, "request") as mock_req:
            result = client.search_account_repositories("makeplane", "Organization", "org:evil")
        mock_req.assert_not_called()
        assert result == {"total_count": 0, "repositories": []}


@pytest.mark.unit
class TestGithubIssueHelpers:
    def test_slim_branch(self):
        assert _slim_branch({"name": "feat", "protected": True, "commit": {"sha": "abc123"}}) == {
            "name": "feat",
            "protected": True,
            "commit_sha": "abc123",
        }

    def test_slim_pull_request(self):
        slim = _slim_pull_request(
            {
                "number": 3,
                "title": "Add login",
                "state": "open",
                "draft": False,
                "html_url": "https://github.com/o/r/pull/3",
                "head": {"ref": "feat"},
                "base": {"ref": "main"},
            }
        )
        assert slim["number"] == 3
        assert slim["head_branch"] == "feat"
        assert slim["base_branch"] == "main"

    def test_resolve_repository_missing_id(self, github_dev_context):
        repo, error = _resolve_repository(github_dev_context["project"].id, None)
        assert repo is None
        assert error == "repository_id is required"

    def test_resolve_repository_wrong_id(self, github_dev_context):
        repo, error = _resolve_repository(github_dev_context["project"].id, "00000000-0000-0000-0000-000000000099")
        assert repo is None
        assert error == "Repository not found"

    def test_resolve_repository_success(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            repo, error = _resolve_repository(ctx["project"].id, str(ctx["repo"].id))
        assert error is None
        assert repo is not None
        assert repo.name == "plane"
        mock_client.get_repository_by_id.assert_called_once_with(ctx["repo"].repository_id)

    def test_resolve_repository_allows_unsynced_repository(self, github_dev_context):
        ctx = github_dev_context
        stale_repository = GithubRepository.objects.create(
            project=ctx["project"],
            name="stale",
            owner="makeplane",
            repository_id=999003,
            url="https://github.com/makeplane/stale",
        )
        mock_client = _attach_repository_lookup(MagicMock(), stale_repository)

        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            repository, error = _resolve_repository(ctx["project"].id, stale_repository.id)

        assert error is None
        assert repository is not None
        assert repository.id == stale_repository.id
        mock_client.get_repository_by_id.assert_called_once_with(999003)

    def test_resolve_repository_refreshes_stale_metadata(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(
            MagicMock(),
            ctx["repo"],
            name="plane-renamed",
            html_url="https://github.com/makeplane/plane-renamed",
            full_name="makeplane/plane-renamed",
        )

        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            repository, error = _resolve_repository(ctx["project"].id, str(ctx["repo"].id))

        assert error is None
        ctx["repo"].refresh_from_db()
        assert repository.name == "plane-renamed"
        assert ctx["repo"].name == "plane-renamed"
        assert ctx["repo"].url == "https://github.com/makeplane/plane-renamed"

    def test_resolve_repository_rejects_inaccessible_existing(self, github_dev_context):
        ctx = github_dev_context
        mock_client = MagicMock()
        mock_client.get_repository_by_id.side_effect = GitHubAPIError("missing", status_code=404, response="{}")
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            repository, error = _resolve_repository(ctx["project"].id, str(ctx["repo"].id))
        assert repository is None
        assert "not accessible" in error

    def test_installation_id_falls_back_to_workspace_integration(self, github_dev_context):
        ctx = github_dev_context
        GithubRepositorySync.objects.filter(project=ctx["project"]).delete()
        assert _installation_id_for_project(ctx["project"].id) == "123"


@pytest.mark.unit
class TestIssueGithubDevelopmentLink:
    def _post(self, user, workspace, project, issue, data):
        factory = APIRequestFactory()
        request = factory.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/github/",
            data,
            format="json",
        )
        force_authenticate(request, user=user)
        view = IssueGithubDevelopmentEndpoint.as_view()
        return view(request, slug=workspace.slug, project_id=str(project.id), issue_id=str(issue.id))

    def _get(self, user, workspace, project, issue, query=""):
        factory = APIRequestFactory()
        request = factory.get(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/github/{query}"
        )
        force_authenticate(request, user=user)
        view = IssueGithubDevelopmentEndpoint.as_view()
        return view(request, slug=workspace.slug, project_id=str(project.id), issue_id=str(issue.id))

    def _delete(self, user, workspace, project, issue, query):
        factory = APIRequestFactory()
        request = factory.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/github/{query}"
        )
        force_authenticate(request, user=user)
        view = IssueGithubDevelopmentEndpoint.as_view()
        return view(request, slug=workspace.slug, project_id=str(project.id), issue_id=str(issue.id))

    def test_get_development_returns_unsynced_repository_branches(self, github_dev_context):
        ctx = github_dev_context
        active_branch = IssueGithubBranch.objects.create(
            issue=ctx["issue"],
            repository=ctx["repo"],
            name="active",
            project=ctx["project"],
        )
        stale_repository = GithubRepository.objects.create(
            project=ctx["project"],
            name="stale",
            owner="makeplane",
            repository_id=999003,
            url="https://github.com/makeplane/stale",
        )
        stale_branch = IssueGithubBranch.objects.create(
            issue=ctx["issue"],
            repository=stale_repository,
            name="stale",
            project=ctx["project"],
        )

        response = self._get(
            ctx["user"],
            ctx["workspace"],
            ctx["project"],
            ctx["issue"],
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["github_connected"] is True
        assert [repository["id"] for repository in response.data["repositories"]] == [ctx["repo"].id]
        assert {branch["id"] for branch in response.data["branches"]} == {active_branch.id, stale_branch.id}

    def test_create_branch_success(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.get_ref.return_value = {"object": {"sha": "deadbeef"}}
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_branch",
                    "repository_id": str(ctx["repo"].id),
                    "base_branch": "develop",
                    "branch_name": "feature/connect-code",
                },
            )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "feature/connect-code"
        assert response.data["head_sha"] == "deadbeef"
        mock_client.get_ref.assert_called_once_with("makeplane", "plane", "develop")
        mock_client.create_branch.assert_called_once_with(
            "makeplane",
            "plane",
            "feature/connect-code",
            "deadbeef",
        )

    def test_create_branch_without_project_sync(self, github_dev_context):
        ctx = github_dev_context
        GithubRepositorySync.objects.filter(project=ctx["project"]).delete()
        GithubRepository.objects.filter(project=ctx["project"]).delete()
        mock_client = MagicMock()
        mock_client.get_repository_by_id.return_value = {
            "id": 888001,
            "name": "website",
            "html_url": "https://github.com/frc/website",
            "default_branch": "master",
            "full_name": "frc/website",
            "private": False,
            "owner": {"login": "frc"},
        }
        mock_client.get_ref.return_value = {"object": {"sha": "abc123"}}
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_branch",
                    "repository_id": 888001,
                    "base_branch": "master",
                    "branch_name": "PROJ-12-stop-shooting",
                },
            )

        assert response.status_code == status.HTTP_201_CREATED
        repository = GithubRepository.objects.get(project=ctx["project"], repository_id=888001)
        assert repository.owner == "frc"
        assert repository.name == "website"
        mock_client.get_repository_by_id.assert_called_once_with(888001)
        mock_client.create_branch.assert_called_once_with(
            "frc",
            "website",
            "PROJ-12-stop-shooting",
            "abc123",
        )

    def test_create_branch_rejects_inaccessible_repository(self, github_dev_context):
        ctx = github_dev_context
        GithubRepositorySync.objects.filter(project=ctx["project"]).delete()
        GithubRepository.objects.filter(project=ctx["project"]).delete()
        mock_client = MagicMock()
        mock_client.get_repository_by_id.side_effect = GitHubAPIError("missing", status_code=404, response="{}")
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_branch",
                    "repository_id": 777001,
                    "branch_name": "feature/x",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not accessible" in response.data["error"]
        assert GithubRepository.objects.filter(project=ctx["project"]).count() == 0

    def test_list_installation_repositories(self, github_dev_context):
        ctx = github_dev_context
        mock_client = MagicMock()
        mock_client.list_account_repositories.return_value = {
            "total_count": 1,
            "repositories": [{"id": 1, "name": "plane"}],
        }
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                "?list=repositories",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_count"] == 1
        mock_client.list_account_repositories.assert_called_once_with("makeplane", "Organization", per_page=100)
        mock_client.list_repositories.assert_not_called()

    def test_list_installation_repositories_searches_account(self, github_dev_context):
        ctx = github_dev_context
        mock_client = MagicMock()
        mock_client.search_account_repositories.return_value = {
            "total_count": 1,
            "repositories": [{"id": 456, "name": "website"}],
        }
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                "?list=repositories&q=website",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["repositories"][0]["name"] == "website"
        mock_client.search_account_repositories.assert_called_once_with("makeplane", "Organization", "website")

    def test_list_installation_repositories_falls_back_to_installation(self, github_dev_context):
        ctx = github_dev_context
        workspace_integration = WorkspaceIntegration.objects.get(workspace=ctx["workspace"])
        workspace_integration.config = {"installation_id": "123"}
        workspace_integration.save(update_fields=["config"])
        mock_client = MagicMock()
        mock_client.get_installation.return_value = {
            "account": {"login": "frc", "id": 99, "type": "Organization"},
            "target_type": "Organization",
        }
        mock_client.list_account_repositories.return_value = {
            "total_count": 0,
            "repositories": [],
        }
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                "?list=repositories",
            )
        assert response.status_code == status.HTTP_200_OK
        mock_client.get_installation.assert_called_once()
        mock_client.list_account_repositories.assert_called_once_with("frc", "Organization", per_page=100)
        workspace_integration.refresh_from_db()
        assert workspace_integration.config["account_login"] == "frc"

    def test_list_installation_repositories_requires_install(self, github_dev_context):
        ctx = github_dev_context
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=None,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                "?list=repositories",
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not installed" in response.data["error"]

    def test_unlink_branch(self, github_dev_context):
        ctx = github_dev_context
        branch = IssueGithubBranch.objects.create(
            issue=ctx["issue"],
            repository=ctx["repo"],
            name="feature/unlink",
            project=ctx["project"],
        )

        with patch("plane.app.views.integration.github_issue._emit_activity"):
            response = self._delete(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                f"?entity=branch&id={branch.id}",
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueGithubBranch.objects.filter(pk=branch.id).exists()

    def test_link_branch_requires_github_app(self, github_dev_context):
        ctx = github_dev_context
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=None,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "link_branch",
                    "repository_id": str(ctx["repo"].id),
                    "branch_name": "feature/x",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not installed" in response.data["error"]
        assert IssueGithubBranch.objects.filter(issue=ctx["issue"]).count() == 0

    def test_link_branch_success(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.get_branch.return_value = {"commit": {"sha": "deadbeef"}}
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "link_branch",
                    "repository_id": str(ctx["repo"].id),
                    "branch_name": "feature/x",
                },
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "feature/x"
        assert response.data["head_sha"] == "deadbeef"
        branch = IssueGithubBranch.objects.get(issue=ctx["issue"], name="feature/x")
        assert branch.head_sha == "deadbeef"

    def test_link_branch_not_found_on_github(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.get_branch.side_effect = GitHubAPIError("missing", status_code=404, response="{}")
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "link_branch",
                    "repository_id": str(ctx["repo"].id),
                    "branch_name": "missing",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not found" in response.data["error"].lower()

    def test_link_pull_request_success(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.get_pull_request.return_value = {
            "id": 55,
            "title": "Fix crash",
            "state": "open",
            "draft": False,
            "merged": False,
            "html_url": "https://github.com/makeplane/plane/pull/55",
            "head": {"ref": "fix"},
            "base": {"ref": "main"},
            "node_id": "PR_1",
        }
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "link_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "number": 55,
                },
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["number"] == 55
        assert response.data["title"] == "Fix crash"

    def test_list_branches_remote(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.list_branches.return_value = [
            {"name": "main", "protected": True, "commit": {"sha": "aaa"}},
            {"name": "feat-login", "protected": False, "commit": {"sha": "bbb"}},
        ]
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                f"?list=branches&repository_id={ctx['repo'].id}&q=feat",
            )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["branches"]) == 1
        assert response.data["branches"][0]["name"] == "feat-login"

    def test_list_pull_requests_requires_install(self, github_dev_context):
        ctx = github_dev_context
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=None,
        ):
            response = self._get(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                f"?list=pull_requests&repository_id={ctx['repo'].id}",
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not installed" in response.data["error"]

    def test_create_pull_request_success(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.create_pull_request.return_value = {
            "id": 88,
            "number": 42,
            "title": "PROJ-12 Add login",
            "state": "open",
            "draft": False,
            "merged": False,
            "html_url": "https://github.com/makeplane/plane/pull/42",
            "head": {"ref": "feature/login", "sha": "abc123"},
            "base": {"ref": "main"},
            "node_id": "PR_42",
        }
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "head_branch": "feature/login",
                    "base_branch": "main",
                    "title": "PROJ-12 Add login",
                    "body": "PROJ-12",
                },
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["number"] == 42
        assert response.data["title"] == "PROJ-12 Add login"
        mock_client.create_pull_request.assert_called_once_with(
            "makeplane",
            "plane",
            "PROJ-12 Add login",
            "feature/login",
            "main",
            body="PROJ-12",
            draft=False,
        )
        assert IssueGithubPullRequest.objects.filter(issue=ctx["issue"], number=42).exists()
        assert IssueGithubBranch.objects.filter(issue=ctx["issue"], name="feature/login").exists()

    def test_create_pull_request_requires_head_branch(self, github_dev_context):
        ctx = github_dev_context
        response = self._post(
            ctx["user"],
            ctx["workspace"],
            ctx["project"],
            ctx["issue"],
            {
                "action": "create_pull_request",
                "repository_id": str(ctx["repo"].id),
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "head_branch" in response.data["error"]

    def test_create_pull_request_requires_install(self, github_dev_context):
        ctx = github_dev_context
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=None,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "head_branch": "feature/login",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not installed" in response.data["error"]

    def test_create_pull_request_already_exists(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.create_pull_request.side_effect = GitHubAPIError(
            "failed",
            status_code=422,
            response='{"message":"Validation Failed","errors":[{"message":"A pull request already exists for makeplane:feature/login"}]}',
        )
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "head_branch": "feature/login",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "A pull request already exists for this branch."

    def test_create_pull_request_no_commits(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.create_pull_request.side_effect = GitHubAPIError(
            "failed",
            status_code=422,
            response='{"message":"Validation Failed","errors":[{"message":"No commits between main and feature/login"}]}',
        )
        with patch(
            "plane.app.views.integration.github_issue._get_client_for_project",
            return_value=mock_client,
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "head_branch": "feature/login",
                },
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No commits on this branch yet" in response.data["error"]

    def test_create_pull_request_defaults_title_and_body(self, github_dev_context):
        ctx = github_dev_context
        mock_client = _attach_repository_lookup(MagicMock(), ctx["repo"])
        mock_client.create_pull_request.return_value = {
            "id": 1,
            "number": 7,
            "title": "PROJ-12 Test issue",
            "state": "open",
            "draft": False,
            "merged": False,
            "html_url": "https://github.com/makeplane/plane/pull/7",
            "head": {"ref": "feature/login", "sha": "abc"},
            "base": {"ref": "main"},
        }
        with (
            patch(
                "plane.app.views.integration.github_issue._get_client_for_project",
                return_value=mock_client,
            ),
            patch("plane.app.views.integration.github_issue._emit_activity"),
            patch(
                "plane.app.views.integration.github_issue.base_host",
                return_value="http://localhost:3000",
            ),
        ):
            response = self._post(
                ctx["user"],
                ctx["workspace"],
                ctx["project"],
                ctx["issue"],
                {
                    "action": "create_pull_request",
                    "repository_id": str(ctx["repo"].id),
                    "head_branch": "feature/login",
                },
            )
        assert response.status_code == status.HTTP_201_CREATED
        args, kwargs = mock_client.create_pull_request.call_args
        assert args[2] == "PROJ-12 Test issue"
        assert "PROJ-12" in kwargs["body"]
        assert str(ctx["issue"].id) in kwargs["body"]

    def test_pull_request_create_error_message_mapping(self):
        already = GitHubAPIError("x", status_code=422, response="A pull request already exists for foo")
        assert _pull_request_create_error_message(already) == "A pull request already exists for this branch."
        empty = GitHubAPIError("x", status_code=422, response="No commits between main and head")
        assert "No commits on this branch yet" in _pull_request_create_error_message(empty)
        missing = GitHubAPIError("x", status_code=404, response="Not Found")
        assert _pull_request_create_error_message(missing) == "Branch not found on GitHub."
