# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import json

from django.conf import settings
from django.db import models

from plane.db.models.base import BaseModel
from plane.db.models.project import ProjectBaseModel
from plane.license.utils.encryption import decrypt_data, encrypt_data


def compute_filter_hash(payload) -> str:
    if not payload:
        return ""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


class SlackProjectSync(ProjectBaseModel):
    """Deprecated Incoming-Webhook-era mapping. Do not write new rows."""

    access_token = models.CharField(max_length=300)
    scopes = models.TextField()
    bot_user_id = models.CharField(max_length=50)
    webhook_url = models.URLField(max_length=1000)
    data = models.JSONField(default=dict)
    team_id = models.CharField(max_length=30)
    team_name = models.CharField(max_length=300)
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration", related_name="slack_syncs", on_delete=models.CASCADE
    )

    def __str__(self):
        return f"{self.project.name}"

    class Meta:
        unique_together = ["team_id", "project"]
        verbose_name = "Slack Project Sync"
        verbose_name_plural = "Slack Project Syncs"
        db_table = "slack_project_syncs"
        ordering = ("-created_at",)


class SlackWorkspaceConnection(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="slack_workspace_connections", on_delete=models.CASCADE)
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration",
        related_name="slack_workspace_connections",
        on_delete=models.CASCADE,
    )
    team_id = models.CharField(max_length=32, unique=True, db_index=True)
    team_name = models.CharField(max_length=300, blank=True, default="")
    bot_user_id = models.CharField(max_length=50, blank=True, default="")
    bot_access_token = models.TextField(blank=True, default="")
    bot_refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.TextField(blank=True, default="")
    installed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="slack_workspace_installs",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    is_enabled = models.BooleanField(default=True)
    app_uninstalled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["workspace", "team_id"]
        verbose_name = "Slack Workspace Connection"
        verbose_name_plural = "Slack Workspace Connections"
        db_table = "slack_workspace_connections"
        ordering = ("-created_at",)

    def set_bot_tokens(self, access_token: str, refresh_token: str | None = None):
        self.bot_access_token = encrypt_data(access_token or "")
        if refresh_token is not None:
            self.bot_refresh_token = encrypt_data(refresh_token)

    def get_bot_access_token(self) -> str:
        return decrypt_data(self.bot_access_token) or ""

    def get_bot_refresh_token(self) -> str:
        return decrypt_data(self.bot_refresh_token) or ""


class SlackUserConnection(BaseModel):
    workspace_connection = models.ForeignKey(
        SlackWorkspaceConnection,
        related_name="user_connections",
        on_delete=models.CASCADE,
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="slack_user_connections", on_delete=models.CASCADE)
    slack_user_id = models.CharField(max_length=50, db_index=True)
    slack_email = models.EmailField(blank=True, default="")
    user_access_token = models.TextField(blank=True, default="")
    user_refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scopes = models.TextField(blank=True, default="")

    class Meta:
        unique_together = [
            ["workspace_connection", "slack_user_id"],
            ["workspace_connection", "user"],
        ]
        verbose_name = "Slack User Connection"
        verbose_name_plural = "Slack User Connections"
        db_table = "slack_user_connections"
        ordering = ("-created_at",)

    def set_user_tokens(self, access_token: str, refresh_token: str | None = None):
        self.user_access_token = encrypt_data(access_token or "")
        if refresh_token is not None:
            self.user_refresh_token = encrypt_data(refresh_token)

    def get_user_access_token(self) -> str:
        return decrypt_data(self.user_access_token) or ""

    def get_user_refresh_token(self) -> str:
        return decrypt_data(self.user_refresh_token) or ""


class SlackChannelSubscription(BaseModel):
    workspace_connection = models.ForeignKey(
        SlackWorkspaceConnection,
        related_name="channel_subscriptions",
        on_delete=models.CASCADE,
    )
    project = models.ForeignKey("db.Project", related_name="slack_channel_subscriptions", on_delete=models.CASCADE)
    workspace = models.ForeignKey("db.Workspace", related_name="slack_channel_subscriptions", on_delete=models.CASCADE)
    channel_id = models.CharField(max_length=50, db_index=True)
    channel_name = models.CharField(max_length=255, blank=True, default="")
    is_private_channel = models.BooleanField(default=False)
    events = models.JSONField(default=list)
    filter_payload = models.JSONField(default=dict)
    custom_property_ids = models.JSONField(default=list)
    filter_hash = models.CharField(max_length=64, blank=True, default="")
    is_paused = models.BooleanField(default=False)
    public_channel_ack = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="slack_channel_subscriptions",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    last_posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["workspace_connection", "channel_id", "project", "filter_hash"]
        verbose_name = "Slack Channel Subscription"
        verbose_name_plural = "Slack Channel Subscriptions"
        db_table = "slack_channel_subscriptions"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self.project_id:
            self.workspace_id = self.project.workspace_id
        if not self.events and not self.custom_property_ids:
            self.events = ["create", "state", "assignee", "comment"]
        self.filter_hash = compute_filter_hash(self.filter_payload)
        super().save(*args, **kwargs)


class SlackThreadLink(BaseModel):
    workspace_connection = models.ForeignKey(
        SlackWorkspaceConnection,
        related_name="thread_links",
        on_delete=models.CASCADE,
    )
    issue = models.ForeignKey("db.Issue", related_name="slack_thread_links", on_delete=models.CASCADE)
    channel_id = models.CharField(max_length=50)
    thread_ts = models.CharField(max_length=32)
    sync_enabled = models.BooleanField(default=True)
    created_from = models.CharField(max_length=20, default="create")

    class Meta:
        unique_together = ["channel_id", "thread_ts"]
        verbose_name = "Slack Thread Link"
        verbose_name_plural = "Slack Thread Links"
        db_table = "slack_thread_links"
        ordering = ("-created_at",)


class SlackEventIdempotency(BaseModel):
    event_id = models.CharField(max_length=128, unique=True, db_index=True)

    class Meta:
        verbose_name = "Slack Event Idempotency"
        verbose_name_plural = "Slack Event Idempotency"
        db_table = "slack_event_idempotency"
        ordering = ("-created_at",)


class SlackAuditLog(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="slack_audit_logs", on_delete=models.CASCADE)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="slack_audit_logs",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Slack Audit Log"
        verbose_name_plural = "Slack Audit Logs"
        db_table = "slack_audit_logs"
        ordering = ("-created_at",)
