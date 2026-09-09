# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import re

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.integration import (
    GithubRepositorySerializer,
    IssueGithubBranchSerializer,
    IssueGithubPullRequestSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    GithubRepository,
    GithubRepositorySync,
    Issue,
    IssueGithubBranch,
    IssueGithubPullRequest,
    Project,
    WorkspaceIntegration,
)
from plane.utils.github import (
    GitHubAPIError,
    GitHubAppClient,
    build_branch_name,
    build_pull_request_body,
    build_pull_request_title,
)
from plane.utils.host import base_host


def _workspace_integration_for_project(project_id) -> WorkspaceIntegration | None:
    project = Project.objects.filter(pk=project_id).first()
    if not project:
        return None
    return WorkspaceIntegration.objects.filter(
        workspace_id=project.workspace_id,
        integration__provider="github",
    ).first()


def _installation_id_for_project(project_id) -> str | None:
    sync = GithubRepositorySync.objects.filter(project_id=project_id).select_related("workspace_integration").first()
    if sync:
        return (sync.credentials or {}).get("installation_id") or (sync.workspace_integration.config or {}).get(
            "installation_id"
        )
    workspace_integration = _workspace_integration_for_project(project_id)
    if not workspace_integration:
        return None
    return (workspace_integration.config or {}).get("installation_id")


def _get_client_for_project(project_id) -> GitHubAppClient | None:
    installation_id = _installation_id_for_project(project_id)
    if not installation_id:
        return None
    return GitHubAppClient(installation_id=installation_id)


def _persist_installation_account(workspace_integration: WorkspaceIntegration, installation: dict) -> tuple[str, str]:
    account = installation.get("account") or {}
    login = account.get("login") or ""
    account_type = account.get("type") or installation.get("target_type") or "Organization"
    if not login:
        return "", account_type
    config = dict(workspace_integration.config or {})
    config.update(
        {
            "account_login": login,
            "account_id": account.get("id"),
            "account_type": account.get("type"),
            "target_type": installation.get("target_type"),
        }
    )
    workspace_integration.config = config
    workspace_integration.save(update_fields=["config", "updated_at"])
    return login, account_type


def _installation_account_for_project(project_id) -> tuple[str | None, str | None]:
    workspace_integration = _workspace_integration_for_project(project_id)
    if not workspace_integration:
        return None, None
    config = workspace_integration.config or {}
    login = config.get("account_login")
    account_type = config.get("account_type") or config.get("target_type")
    if login:
        return login, account_type or "Organization"

    client = _get_client_for_project(project_id)
    if not client:
        return None, None
    try:
        installation = client.get_installation()
    except GitHubAPIError:
        return None, None
    login, account_type = _persist_installation_account(workspace_integration, installation)
    if not login:
        return None, None
    return login, account_type


def _active_repository_ids(project_id):
    return GithubRepositorySync.objects.filter(
        project_id=project_id,
        repository__deleted_at__isnull=True,
    ).values_list("repository_id", flat=True)


def _parse_github_repository_id(repository_id) -> int | None:
    try:
        value = int(repository_id)
    except (TypeError, ValueError):
        return None
    if value < 1:
        return None
    return value


def _existing_project_repository(project_id, repository_id) -> GithubRepository | None:
    try:
        repository = GithubRepository.objects.filter(project_id=project_id, pk=repository_id).first()
        if repository:
            return repository
    except (TypeError, ValueError, ValidationError):
        pass
    github_repo_id = _parse_github_repository_id(repository_id)
    if github_repo_id is None:
        return None
    return GithubRepository.objects.filter(project_id=project_id, repository_id=github_repo_id).first()


def _fields_from_github_repository(data: dict) -> dict | None:
    if not isinstance(data, dict):
        return None
    owner = (data.get("owner") or {}).get("login")
    name = data.get("name")
    try:
        github_repo_id = int(data.get("id"))
    except (TypeError, ValueError):
        github_repo_id = None
    if not owner or not name or github_repo_id is None:
        return None
    return {
        "name": name,
        "owner": owner,
        "repository_id": github_repo_id,
        "url": data.get("html_url") or f"https://github.com/{owner}/{name}",
        "config": {
            "default_branch": data.get("default_branch") or "",
            "full_name": data.get("full_name") or f"{owner}/{name}",
            "private": bool(data.get("private")),
        },
    }


def _apply_repository_fields(repository: GithubRepository, fields: dict) -> GithubRepository:
    update_fields = []
    for key in ("name", "owner", "url", "config"):
        if getattr(repository, key) != fields[key]:
            setattr(repository, key, fields[key])
            update_fields.append(key)
    if update_fields:
        repository.save(update_fields=[*update_fields, "updated_at"])
    return repository


def _persist_repository(project_id, fields: dict) -> GithubRepository | None:
    project = Project.objects.filter(pk=project_id).first()
    if not project:
        return None
    defaults = {
        "project": project,
        "name": fields["name"],
        "owner": fields["owner"],
        "url": fields["url"],
        "config": fields["config"],
    }
    try:
        with transaction.atomic():
            repository, created = GithubRepository.objects.get_or_create(
                project_id=project_id,
                repository_id=fields["repository_id"],
                defaults=defaults,
            )
    except IntegrityError:
        repository = GithubRepository.objects.filter(
            project_id=project_id,
            repository_id=fields["repository_id"],
        ).first()
        if not repository:
            return None
        created = False
    if not created:
        return _apply_repository_fields(repository, fields)
    return repository


def _fetch_installation_repository(project_id, github_repo_id: int) -> tuple[dict | None, str | None]:
    client = _get_client_for_project(project_id)
    if not client:
        return None, "GitHub App is not installed for this project"
    try:
        data = client.get_repository_by_id(github_repo_id)
    except GitHubAPIError:
        return None, "Repository is not accessible to this GitHub App installation"
    fields = _fields_from_github_repository(data)
    if not fields or fields["repository_id"] != github_repo_id:
        return None, "GitHub returned invalid repository metadata"
    return fields, None


def _resolve_repository(
    project_id, repository_id, persist: bool = True
) -> tuple[GithubRepository | None, str | None]:
    """Resolve a project repository by Plane UUID or GitHub numeric id.

    Always verifies the current installation can access the GitHub repo, then
    optionally persists or refreshes the local GithubRepository row.
    persist=False is for remote list lookups.
    """
    if not repository_id:
        return None, "repository_id is required"

    existing = _existing_project_repository(project_id, repository_id)
    github_repo_id = existing.repository_id if existing else _parse_github_repository_id(repository_id)
    if github_repo_id is None:
        return None, "Repository not found"

    fields, error = _fetch_installation_repository(project_id, github_repo_id)
    if error:
        return None, error

    if persist:
        repository = _persist_repository(project_id, fields)
        if not repository:
            return None, "Project not found"
        return repository, None

    return GithubRepository(**fields), None


def _emit_activity(request, *, activity_type: str, issue_id, project_id, data, current=None):
    issue_activity.delay(
        type=activity_type,
        requested_data=json.dumps(data, cls=DjangoJSONEncoder),
        actor_id=str(request.user.id),
        issue_id=str(issue_id),
        project_id=str(project_id),
        current_instance=json.dumps(current, cls=DjangoJSONEncoder) if current else None,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=base_host(request=request, is_app=True),
    )


def _slim_branch(branch: dict) -> dict:
    commit = branch.get("commit") or {}
    return {
        "name": branch.get("name") or "",
        "protected": bool(branch.get("protected")),
        "commit_sha": commit.get("sha") or "",
    }


def _slim_pull_request(pr: dict) -> dict:
    return {
        "number": pr.get("number"),
        "title": pr.get("title") or "",
        "state": pr.get("state") or "open",
        "draft": bool(pr.get("draft")),
        "html_url": pr.get("html_url") or "",
        "head_branch": ((pr.get("head") or {}).get("ref") or ""),
        "base_branch": ((pr.get("base") or {}).get("ref") or ""),
    }


def _github_error_blob(exc: GitHubAPIError) -> str:
    raw = exc.response
    if isinstance(raw, dict):
        return json.dumps(raw)
    if isinstance(raw, (bytes, bytearray)):
        return raw.decode("utf-8", errors="ignore")
    return str(raw or exc)


def _pull_request_create_error_message(exc: GitHubAPIError) -> str:
    blob = _github_error_blob(exc).lower()
    if "already exists" in blob:
        return "A pull request already exists for this branch."
    if "no commits" in blob or "commits between" in blob:
        return "No commits on this branch yet. Push at least one commit, then try again."
    if exc.status_code == 404 or "not found" in blob:
        return "Branch not found on GitHub."
    return "Failed to create pull request on GitHub"


def _work_item_url(request, slug, project_id, issue_id) -> str:
    origin = base_host(request=request, is_app=True).rstrip("/")
    return f"{origin}/{slug}/projects/{project_id}/issues/{issue_id}"


def _upsert_pull_request(issue, repository, project_id, pr: dict, number: int | None = None) -> IssueGithubPullRequest:
    pr_number = number if number is not None else pr.get("number")
    if pr_number is None:
        raise ValueError("Pull request number is required")
    pr_number = int(pr_number)
    pull_request, _ = IssueGithubPullRequest.objects.update_or_create(
        issue=issue,
        repository=repository,
        number=pr_number,
        defaults={
            "project_id": project_id,
            "github_id": pr.get("id"),
            "title": pr.get("title") or "",
            "state": pr.get("state") or "open",
            "draft": bool(pr.get("draft")),
            "merged": bool(pr.get("merged")),
            "html_url": pr.get("html_url") or "",
            "head_branch": ((pr.get("head") or {}).get("ref") or ""),
            "base_branch": ((pr.get("base") or {}).get("ref") or ""),
            "metadata": {"node_id": pr.get("node_id")},
        },
    )
    return pull_request


def _upsert_head_branch(issue, repository, project_id, pr: dict) -> IssueGithubBranch | None:
    head = pr.get("head") or {}
    head_branch = (head.get("ref") or "").strip()
    if not head_branch:
        return None
    head_sha = head.get("sha") or ""
    url = f"https://github.com/{repository.owner}/{repository.name}/tree/{head_branch}"
    branch, _ = IssueGithubBranch.objects.update_or_create(
        issue=issue,
        repository=repository,
        name=head_branch,
        defaults={
            "project_id": project_id,
            "head_sha": head_sha,
            "url": url,
            "status": "active",
        },
    )
    return branch


class IssueGithubDevelopmentEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        list_kind = request.GET.get("list")
        if list_kind == "repositories":
            return self._list_installation_repositories(request, project_id)
        if list_kind in ("branches", "pull_requests"):
            return self._list_remote(request, project_id, list_kind)

        default_repository_ids = _active_repository_ids(project_id)
        branches = IssueGithubBranch.objects.filter(
            issue_id=issue_id,
            project_id=project_id,
        ).select_related("repository")
        pull_requests = IssueGithubPullRequest.objects.filter(
            issue_id=issue_id,
            project_id=project_id,
        ).select_related("repository")
        linked_repos = GithubRepository.objects.filter(project_id=project_id, id__in=default_repository_ids)

        include_commits = request.GET.get("include_commits") == "1"
        branch_id = request.GET.get("branch_id")
        commits = []
        commits_error = None
        if include_commits and branch_id:
            branch = branches.filter(pk=branch_id).first()
            client = _get_client_for_project(project_id)
            if branch and client:
                try:
                    commits = client.list_commits(
                        branch.repository.owner,
                        branch.repository.name,
                        branch.name,
                        per_page=15,
                    )
                except GitHubAPIError as exc:
                    commits = []
                    commits_error = str(exc) or "Failed to fetch commits from GitHub"
            elif branch and not client:
                commits_error = "GitHub App is not installed for this project"

        payload = {
            "github_connected": bool(_installation_id_for_project(project_id)),
            "repositories": GithubRepositorySerializer(linked_repos, many=True).data,
            "branches": IssueGithubBranchSerializer(branches, many=True).data,
            "pull_requests": IssueGithubPullRequestSerializer(pull_requests, many=True).data,
            "commits": commits,
        }
        if commits_error:
            payload["commits_error"] = commits_error

        return Response(payload, status=status.HTTP_200_OK)

    def _list_installation_repositories(self, request, project_id):
        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login, account_type = _installation_account_for_project(project_id)
        if not login:
            return Response(
                {"error": "GitHub App is not installed for this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = (request.GET.get("q") or "").strip()
        try:
            if query:
                data = client.search_account_repositories(login, account_type, query)
            else:
                data = client.list_account_repositories(login, account_type, per_page=100)
        except GitHubAPIError as exc:
            return Response(
                {"error": str(exc), "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "total_count": data.get("total_count", 0),
                "repositories": data.get("repositories", []),
            },
            status=status.HTTP_200_OK,
        )

    def _list_remote(self, request, project_id, list_kind: str):
        repository_id = request.GET.get("repository_id")
        repository, error = _resolve_repository(project_id, repository_id, persist=False)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = (request.GET.get("q") or "").strip().lower()

        try:
            if list_kind == "branches":
                items = client.list_branches(repository.owner, repository.name)
                slim = [_slim_branch(b) for b in items]
                if query:
                    slim = [b for b in slim if query in (b.get("name") or "").lower()]
                return Response({"branches": slim}, status=status.HTTP_200_OK)

            items = client.list_pull_requests(repository.owner, repository.name, state="open")
            slim = [_slim_pull_request(p) for p in items]
            if query:
                slim = [
                    p
                    for p in slim
                    if query in (p.get("title") or "").lower()
                    or query in str(p.get("number") or "")
                    or query in (p.get("head_branch") or "").lower()
                ]
            return Response({"pull_requests": slim}, status=status.HTTP_200_OK)
        except GitHubAPIError as exc:
            return Response(
                {"error": f"Failed to list {list_kind.replace('_', ' ')} from GitHub", "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, issue_id):
        action = request.data.get("action") or request.GET.get("action")
        if action == "create_branch":
            return self._create_branch(request, slug, project_id, issue_id)
        if action == "link_branch":
            return self._link_branch(request, slug, project_id, issue_id)
        if action == "link_pull_request":
            return self._link_pull_request(request, slug, project_id, issue_id)
        if action == "create_pull_request":
            return self._create_pull_request(request, slug, project_id, issue_id)
        return Response(
            {
                "error": "action must be create_branch, link_branch, link_pull_request, or create_pull_request"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def delete(self, request, slug, project_id, issue_id):
        entity = request.GET.get("entity")
        pk = request.GET.get("id")
        if not entity or not pk:
            return Response({"error": "entity and id are required"}, status=status.HTTP_400_BAD_REQUEST)

        if entity == "branch":
            obj = IssueGithubBranch.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_id=issue_id,
                pk=pk,
            ).first()
            if not obj:
                return Response({"error": "Branch link not found"}, status=status.HTTP_404_NOT_FOUND)
            data = IssueGithubBranchSerializer(obj).data
            obj.delete()
            _emit_activity(
                request,
                activity_type="github_branch.activity.deleted",
                issue_id=issue_id,
                project_id=project_id,
                data=data,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        if entity == "pull_request":
            obj = IssueGithubPullRequest.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_id=issue_id,
                pk=pk,
            ).first()
            if not obj:
                return Response({"error": "Pull request link not found"}, status=status.HTTP_404_NOT_FOUND)
            data = IssueGithubPullRequestSerializer(obj).data
            obj.delete()
            _emit_activity(
                request,
                activity_type="github_pull_request.activity.deleted",
                issue_id=issue_id,
                project_id=project_id,
                data=data,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"error": "entity must be branch or pull_request"}, status=status.HTTP_400_BAD_REQUEST)

    def _create_branch(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        repository_id = request.data.get("repository_id")
        base_branch = request.data.get("base_branch") or "main"
        branch_name = request.data.get("branch_name")

        repository, error = _resolve_repository(project_id, repository_id)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        project = Project.objects.get(pk=project_id)
        if not branch_name:
            branch_name = build_branch_name(project.identifier, issue.sequence_id, issue.name)

        # sanitize branch name for git refs
        branch_name = re.sub(r"\s+", "-", branch_name.strip())

        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ref = client.get_ref(repository.owner, repository.name, base_branch)
            sha = ref["object"]["sha"]
            client.create_branch(repository.owner, repository.name, branch_name, sha)
        except GitHubAPIError as exc:
            message = "Failed to create branch on GitHub"
            if exc.status_code == 422:
                message = f"Branch already exists on {repository.owner}/{repository.name}"
            return Response(
                {"error": message, "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

        url = f"https://github.com/{repository.owner}/{repository.name}/tree/{branch_name}"
        branch, created = IssueGithubBranch.objects.get_or_create(
            issue=issue,
            repository=repository,
            name=branch_name,
            defaults={
                "project_id": project_id,
                "head_sha": sha,
                "url": url,
                "status": "active",
                "metadata": {"base_branch": base_branch},
            },
        )
        if not created:
            branch.head_sha = sha
            branch.url = url
            branch.status = "active"
            branch.save(update_fields=["head_sha", "url", "status", "updated_at"])

        serializer = IssueGithubBranchSerializer(branch)
        _emit_activity(
            request,
            activity_type="github_branch.activity.created",
            issue_id=issue_id,
            project_id=project_id,
            data=serializer.data,
        )
        return Response(
            {
                **serializer.data,
                "checkout_command": f"git fetch origin {branch_name} && git checkout {branch_name}",
            },
            status=status.HTTP_201_CREATED,
        )

    def _link_branch(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        repository_id = request.data.get("repository_id")
        branch_name = request.data.get("branch_name")
        if not repository_id or not branch_name:
            return Response(
                {"error": "repository_id and branch_name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repository, error = _resolve_repository(project_id, repository_id)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        url = f"https://github.com/{repository.owner}/{repository.name}/tree/{branch_name}"
        try:
            branch_data = client.get_branch(repository.owner, repository.name, branch_name)
            head_sha = (branch_data.get("commit") or {}).get("sha") or ""
        except GitHubAPIError as exc:
            return Response(
                {"error": f"Branch not found on {repository.owner}/{repository.name}", "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch, _ = IssueGithubBranch.objects.update_or_create(
            issue=issue,
            repository=repository,
            name=branch_name,
            defaults={
                "project_id": project_id,
                "head_sha": head_sha,
                "url": url,
                "status": "active",
            },
        )
        serializer = IssueGithubBranchSerializer(branch)
        _emit_activity(
            request,
            activity_type="github_branch.activity.created",
            issue_id=issue_id,
            project_id=project_id,
            data=serializer.data,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _link_pull_request(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        repository_id = request.data.get("repository_id")
        number = request.data.get("number")
        if not repository_id or not number:
            return Response(
                {"error": "repository_id and number are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repository, error = _resolve_repository(project_id, repository_id)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pr = client.get_pull_request(repository.owner, repository.name, int(number))
        except (GitHubAPIError, ValueError, TypeError) as exc:
            detail = getattr(exc, "response", None)
            return Response(
                {"error": "Pull request not found on GitHub", "detail": detail},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pull_request = _upsert_pull_request(issue, repository, project_id, pr, number=int(number))
        serializer = IssueGithubPullRequestSerializer(pull_request)
        _emit_activity(
            request,
            activity_type="github_pull_request.activity.created",
            issue_id=issue_id,
            project_id=project_id,
            data=serializer.data,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _create_pull_request(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        repository_id = request.data.get("repository_id")
        head_branch = (request.data.get("head_branch") or "").strip()
        if not head_branch:
            return Response({"error": "head_branch is required"}, status=status.HTTP_400_BAD_REQUEST)

        repository, error = _resolve_repository(project_id, repository_id)
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        client = _get_client_for_project(project_id)
        if not client:
            return Response(
                {"error": "GitHub App is not installed for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = Project.objects.get(pk=project_id)
        default_base = ((repository.config or {}).get("default_branch") or "").strip() or "main"
        base_branch = (request.data.get("base_branch") or "").strip() or default_base
        title = (request.data.get("title") or "").strip() or build_pull_request_title(
            project.identifier, issue.sequence_id, issue.name
        )
        body = request.data.get("body")
        if body is None or (isinstance(body, str) and not body.strip()):
            body = build_pull_request_body(
                project.identifier,
                issue.sequence_id,
                _work_item_url(request, slug, project_id, issue_id),
            )
        draft_raw = request.data.get("draft")
        if isinstance(draft_raw, str):
            draft = draft_raw.strip().lower() in ("1", "true", "yes")
        else:
            draft = bool(draft_raw)

        try:
            pr = client.create_pull_request(
                repository.owner,
                repository.name,
                title,
                head_branch,
                base_branch,
                body=body,
                draft=draft,
            )
        except GitHubAPIError as exc:
            return Response(
                {"error": _pull_request_create_error_message(exc), "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(pr, dict) or not pr.get("number"):
            return Response(
                {"error": "GitHub returned invalid pull request metadata"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _upsert_head_branch(issue, repository, project_id, pr)
        pull_request = _upsert_pull_request(issue, repository, project_id, pr)
        serializer = IssueGithubPullRequestSerializer(pull_request)
        _emit_activity(
            request,
            activity_type="github_pull_request.activity.created",
            issue_id=issue_id,
            project_id=project_id,
            data=serializer.data,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
