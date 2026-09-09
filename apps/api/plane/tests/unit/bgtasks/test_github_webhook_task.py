# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest

from plane.bgtasks.github_webhook_task import (
    _handle_create,
    _handle_pull_request,
    _handle_push,
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


@pytest.fixture
def github_dev_context(db, create_user):
    workspace = Workspace.objects.create(name="WS", slug="gh-ws", owner=create_user)
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
    # Ensure known sequence for identifier matching
    issue.sequence_id = 12
    issue.save(update_fields=["sequence_id"])

    integration = Integration.objects.create(title="GitHub", provider="github", verified=True)
    bot = User.objects.create(email="gh-bot@plane.so", username="gh-bot", is_bot=True)
    token = APIToken.objects.create(user=bot, user_type=1, workspace=workspace, is_service=True)
    wi = WorkspaceIntegration.objects.create(
        workspace=workspace,
        integration=integration,
        actor=bot,
        api_token=token,
        config={"installation_id": "123"},
    )
    repo = GithubRepository.objects.create(
        project=project,
        name="plane",
        owner="makeplane",
        repository_id=999001,
        url="https://github.com/makeplane/plane",
    )
    GithubRepositorySync.objects.create(
        project=project,
        repository=repo,
        actor=bot,
        workspace_integration=wi,
        credentials={"installation_id": "123"},
    )
    return {"workspace": workspace, "project": project, "issue": issue, "repo": repo}


@pytest.mark.unit
@pytest.mark.django_db
class TestGithubWebhookHandlers:
    def test_create_branch_auto_links(self, github_dev_context):
        issue = github_dev_context["issue"]
        repo = github_dev_context["repo"]
        with patch("plane.bgtasks.automation_task.evaluate_automations.delay") as evaluate_delay:
            _handle_create(
                {
                    "ref_type": "branch",
                    "ref": "PROJ-12-add-feature",
                    "repository": {"id": 999001},
                },
                delivery_id="d1",
            )
        branch = IssueGithubBranch.objects.get(issue=issue, repository=repo)
        assert branch.name == "PROJ-12-add-feature"
        assert evaluate_delay.called
        assert evaluate_delay.call_args.kwargs["trigger_types"] == ["github.branch_created"]

    def test_push_updates_head_sha(self, github_dev_context):
        issue = github_dev_context["issue"]
        repo = github_dev_context["repo"]
        IssueGithubBranch.objects.create(
            issue=issue,
            project=issue.project,
            repository=repo,
            name="PROJ-12-add-feature",
            head_sha="aaa",
        )
        _handle_push(
            {
                "ref": "refs/heads/PROJ-12-add-feature",
                "after": "bbbcccddd",
                "repository": {"id": 999001},
            }
        )
        branch = IssueGithubBranch.objects.get(issue=issue, name="PROJ-12-add-feature")
        assert branch.head_sha == "bbbcccddd"

    def test_pull_request_links_by_head_branch(self, github_dev_context):
        issue = github_dev_context["issue"]
        repo = github_dev_context["repo"]
        IssueGithubBranch.objects.create(
            issue=issue,
            project=issue.project,
            repository=repo,
            name="PROJ-12-add-feature",
        )
        with patch("plane.bgtasks.automation_task.evaluate_automations.delay") as evaluate_delay:
            _handle_pull_request(
                {
                    "action": "opened",
                    "pull_request": {
                        "id": 1,
                        "number": 42,
                        "title": "Add feature",
                        "state": "open",
                        "draft": False,
                        "merged": False,
                        "html_url": "https://github.com/makeplane/plane/pull/42",
                        "head": {"ref": "PROJ-12-add-feature"},
                        "base": {"ref": "main"},
                    },
                    "repository": {"id": 999001},
                },
                delivery_id="d2",
            )
        pr = IssueGithubPullRequest.objects.get(issue=issue, number=42)
        assert pr.title == "Add feature"
        assert pr.head_branch == "PROJ-12-add-feature"
        assert evaluate_delay.called
        assert evaluate_delay.call_args.kwargs["trigger_types"] == ["github.pr_opened"]

    def test_pull_request_links_every_issue_with_the_same_branch(self, github_dev_context):
        issue = github_dev_context["issue"]
        repo = github_dev_context["repo"]
        other = Issue.objects.create(
            name="Second issue",
            project=issue.project,
            workspace=issue.workspace,
            state=issue.state,
            created_by=issue.created_by,
        )
        other.sequence_id = 99
        other.save(update_fields=["sequence_id"])
        for target in (issue, other):
            IssueGithubBranch.objects.create(
                issue=target,
                project=issue.project,
                repository=repo,
                name="shared-feature",
            )

        with patch("plane.bgtasks.automation_task.evaluate_automations.delay") as evaluate_delay:
            _handle_pull_request(
                {
                    "action": "opened",
                    "pull_request": {
                        "id": 2,
                        "number": 7,
                        "title": "Shared feature",
                        "state": "open",
                        "draft": False,
                        "merged": False,
                        "html_url": "https://github.com/makeplane/plane/pull/7",
                        "head": {"ref": "shared-feature"},
                        "base": {"ref": "main"},
                    },
                    "repository": {"id": 999001},
                },
                delivery_id="d4",
            )

        linked_issue_ids = set(IssueGithubPullRequest.objects.filter(number=7).values_list("issue_id", flat=True))
        assert linked_issue_ids == {issue.id, other.id}
        assert evaluate_delay.call_count == 2

    def test_create_branch_auto_links_without_sync(self, github_dev_context):
        issue = github_dev_context["issue"]
        repo = github_dev_context["repo"]
        GithubRepositorySync.objects.filter(repository=repo).delete()

        with patch("plane.bgtasks.automation_task.evaluate_automations.delay") as evaluate_delay:
            _handle_create(
                {
                    "ref_type": "branch",
                    "ref": "PROJ-12-stale-repository",
                    "repository": {"id": 999001},
                },
                delivery_id="d3",
            )

        branch = IssueGithubBranch.objects.get(
            issue=issue,
            repository=repo,
            name="PROJ-12-stale-repository",
        )
        assert branch.status == "active"
        assert evaluate_delay.called
