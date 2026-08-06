# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from celery import shared_task

from plane.db.models import (
    GithubRepository,
    Issue,
    IssueGithubBranch,
    IssueGithubPullRequest,
    Project,
)
from plane.utils.github import extract_work_item_identifier, parse_work_item_identifier


def _find_issue_for_identifier(workspace_id, identifier: str):
    parsed = parse_work_item_identifier(identifier)
    if not parsed:
        return None
    project_identifier, sequence_id = parsed
    project = Project.objects.filter(workspace_id=workspace_id, identifier__iexact=project_identifier).first()
    if not project:
        return None
    return Issue.objects.filter(project=project, sequence_id=sequence_id).first()


def _repos_for_github_id(repository_id: int):
    return list(
        GithubRepository.objects.filter(
            repository_id=repository_id,
            syncs__deleted_at__isnull=True,
        )
        .select_related("project", "workspace")
        .distinct()
    )


def _upsert_branch_for_issue(issue, repository, branch_name: str, head_sha: str = ""):
    url = f"https://github.com/{repository.owner}/{repository.name}/tree/{branch_name}"
    IssueGithubBranch.objects.update_or_create(
        issue=issue,
        repository=repository,
        name=branch_name,
        defaults={
            "project_id": issue.project_id,
            "head_sha": head_sha or "",
            "url": url,
            "status": "active",
        },
    )


def _handle_create(payload: dict):
    if payload.get("ref_type") != "branch":
        return
    branch_name = payload.get("ref") or ""
    identifier = extract_work_item_identifier(branch_name)
    if not identifier:
        return
    repo_payload = payload.get("repository") or {}
    repository_id = repo_payload.get("id")
    if not repository_id:
        return

    for repository in _repos_for_github_id(int(repository_id)):
        issue = _find_issue_for_identifier(repository.workspace_id, identifier)
        if issue and issue.project_id == repository.project_id:
            _upsert_branch_for_issue(issue, repository, branch_name)


def _handle_push(payload: dict):
    ref = payload.get("ref") or ""
    if not ref.startswith("refs/heads/"):
        return
    branch_name = ref.removeprefix("refs/heads/")
    head_sha = payload.get("after") or ""
    repo_payload = payload.get("repository") or {}
    repository_id = repo_payload.get("id")
    if not repository_id:
        return

    IssueGithubBranch.objects.filter(
        repository__repository_id=int(repository_id),
        repository__deleted_at__isnull=True,
        repository__syncs__deleted_at__isnull=True,
        name=branch_name,
    ).update(head_sha=head_sha or "")

    # Auto-link if push branch matches identifier and isn't linked yet
    identifier = extract_work_item_identifier(branch_name)
    if not identifier:
        return
    for repository in _repos_for_github_id(int(repository_id)):
        issue = _find_issue_for_identifier(repository.workspace_id, identifier)
        if issue and issue.project_id == repository.project_id:
            _upsert_branch_for_issue(issue, repository, branch_name, head_sha=head_sha)


def _handle_pull_request(payload: dict):
    action = payload.get("action")
    if action not in {
        "opened",
        "edited",
        "closed",
        "reopened",
        "ready_for_review",
        "converted_to_draft",
        "synchronize",
    }:
        return

    pr = payload.get("pull_request") or {}
    repo_payload = payload.get("repository") or {}
    repository_id = repo_payload.get("id")
    if not repository_id or not pr:
        return

    head_branch = (pr.get("head") or {}).get("ref") or ""
    title = pr.get("title") or ""
    body = pr.get("body") or ""
    identifier = (
        extract_work_item_identifier(head_branch)
        or extract_work_item_identifier(title)
        or extract_work_item_identifier(body)
    )

    for repository in _repos_for_github_id(int(repository_id)):
        issue = None
        # Prefer already-linked branch
        linked_branch = (
            IssueGithubBranch.objects.filter(repository=repository, name=head_branch).select_related("issue").first()
        )
        if linked_branch:
            issue = linked_branch.issue
        elif identifier:
            candidate = _find_issue_for_identifier(repository.workspace_id, identifier)
            if candidate and candidate.project_id == repository.project_id:
                issue = candidate

        if not issue:
            continue

        IssueGithubPullRequest.objects.update_or_create(
            issue=issue,
            repository=repository,
            number=int(pr.get("number")),
            defaults={
                "project_id": issue.project_id,
                "github_id": pr.get("id"),
                "title": title,
                "state": pr.get("state") or "open",
                "draft": bool(pr.get("draft")),
                "merged": bool(pr.get("merged_at") or pr.get("merged")),
                "html_url": pr.get("html_url") or "",
                "head_branch": head_branch,
                "base_branch": ((pr.get("base") or {}).get("ref") or ""),
                "metadata": {"action": action},
            },
        )


@shared_task
def process_github_webhook(event: str, delivery_id: str, payload: dict):
    if event == "create":
        _handle_create(payload)
    elif event == "push":
        _handle_push(payload)
    elif event == "pull_request":
        _handle_pull_request(payload)
    # ping / other events acknowledged with no-op
    return {"event": event, "delivery_id": delivery_id}
