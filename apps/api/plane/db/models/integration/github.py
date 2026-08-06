# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports

# Django imports
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class GithubRepository(ProjectBaseModel):
    name = models.CharField(max_length=500)
    url = models.URLField(null=True)
    config = models.JSONField(default=dict)
    repository_id = models.BigIntegerField()
    owner = models.CharField(max_length=500)

    def __str__(self):
        """Return the repo name"""
        return f"{self.name}"

    class Meta:
        verbose_name = "Repository"
        verbose_name_plural = "Repositories"
        db_table = "github_repositories"
        ordering = ("-created_at",)


class GithubRepositorySync(ProjectBaseModel):
    repository = models.OneToOneField("db.GithubRepository", on_delete=models.CASCADE, related_name="syncs")
    credentials = models.JSONField(default=dict)
    # Bot user
    actor = models.ForeignKey("db.User", related_name="user_syncs", on_delete=models.CASCADE)
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration", related_name="github_syncs", on_delete=models.CASCADE
    )
    label = models.ForeignKey("db.Label", on_delete=models.SET_NULL, null=True, related_name="repo_syncs")

    def __str__(self):
        """Return the repo sync"""
        return f"{self.repository.name} <{self.project.name}>"

    class Meta:
        unique_together = ["project", "repository"]
        verbose_name = "Github Repository Sync"
        verbose_name_plural = "Github Repository Syncs"
        db_table = "github_repository_syncs"
        ordering = ("-created_at",)


class GithubIssueSync(ProjectBaseModel):
    repo_issue_id = models.BigIntegerField()
    github_issue_id = models.BigIntegerField()
    issue_url = models.URLField(blank=False)
    issue = models.ForeignKey("db.Issue", related_name="github_syncs", on_delete=models.CASCADE)
    repository_sync = models.ForeignKey("db.GithubRepositorySync", related_name="issue_syncs", on_delete=models.CASCADE)

    def __str__(self):
        """Return the github issue sync"""
        return f"{self.repository.name}-{self.project.name}-{self.issue.name}"

    class Meta:
        unique_together = ["repository_sync", "issue"]
        verbose_name = "Github Issue Sync"
        verbose_name_plural = "Github Issue Syncs"
        db_table = "github_issue_syncs"
        ordering = ("-created_at",)


class GithubCommentSync(ProjectBaseModel):
    repo_comment_id = models.BigIntegerField()
    comment = models.ForeignKey("db.IssueComment", related_name="comment_syncs", on_delete=models.CASCADE)
    issue_sync = models.ForeignKey("db.GithubIssueSync", related_name="comment_syncs", on_delete=models.CASCADE)

    def __str__(self):
        """Return the github issue sync"""
        return f"{self.comment.id}"

    class Meta:
        unique_together = ["issue_sync", "comment"]
        verbose_name = "Github Comment Sync"
        verbose_name_plural = "Github Comment Syncs"
        db_table = "github_comment_syncs"
        ordering = ("-created_at",)


class IssueGithubBranch(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="github_branches")
    repository = models.ForeignKey(
        "db.GithubRepository", on_delete=models.CASCADE, related_name="issue_branches"
    )
    name = models.CharField(max_length=500)
    head_sha = models.CharField(max_length=64, blank=True, default="")
    url = models.URLField(blank=True, default="")
    status = models.CharField(max_length=50, default="active")
    metadata = models.JSONField(default=dict)

    def __str__(self):
        return f"{self.name} <{self.issue_id}>"

    class Meta:
        unique_together = ["issue", "repository", "name"]
        verbose_name = "Issue Github Branch"
        verbose_name_plural = "Issue Github Branches"
        db_table = "issue_github_branches"
        ordering = ("-created_at",)


class IssueGithubPullRequest(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="github_pull_requests")
    repository = models.ForeignKey(
        "db.GithubRepository", on_delete=models.CASCADE, related_name="issue_pull_requests"
    )
    number = models.PositiveIntegerField()
    github_id = models.BigIntegerField(null=True, blank=True)
    title = models.CharField(max_length=500, blank=True, default="")
    state = models.CharField(max_length=50, default="open")
    draft = models.BooleanField(default=False)
    merged = models.BooleanField(default=False)
    html_url = models.URLField(blank=True, default="")
    head_branch = models.CharField(max_length=500, blank=True, default="")
    base_branch = models.CharField(max_length=500, blank=True, default="")
    metadata = models.JSONField(default=dict)

    def __str__(self):
        return f"PR #{self.number} <{self.issue_id}>"

    class Meta:
        unique_together = ["issue", "repository", "number"]
        verbose_name = "Issue Github Pull Request"
        verbose_name_plural = "Issue Github Pull Requests"
        db_table = "issue_github_pull_requests"
        ordering = ("-created_at",)
