# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0128_automation_engine"),
    ]

    operations = [
        migrations.AddField(
            model_name="usernotificationpreference",
            name="slack_dm",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="usernotificationpreference",
            name="mute_email_when_slack_dm",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="SlackWorkspaceConnection",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("team_id", models.CharField(db_index=True, max_length=32, unique=True)),
                ("team_name", models.CharField(blank=True, default="", max_length=300)),
                ("bot_user_id", models.CharField(blank=True, default="", max_length=50)),
                ("bot_access_token", models.TextField(blank=True, default="")),
                ("bot_refresh_token", models.TextField(blank=True, default="")),
                ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                ("scopes", models.TextField(blank=True, default="")),
                ("is_enabled", models.BooleanField(default=True)),
                ("app_uninstalled_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "installed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slack_workspace_installs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_workspace_connections",
                        to="db.workspace",
                    ),
                ),
                (
                    "workspace_integration",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_workspace_connections",
                        to="db.workspaceintegration",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack Workspace Connection",
                "verbose_name_plural": "Slack Workspace Connections",
                "db_table": "slack_workspace_connections",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "team_id")},
            },
        ),
        migrations.CreateModel(
            name="SlackUserConnection",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("slack_user_id", models.CharField(db_index=True, max_length=50)),
                ("slack_email", models.EmailField(blank=True, default="", max_length=254)),
                ("user_access_token", models.TextField(blank=True, default="")),
                ("user_refresh_token", models.TextField(blank=True, default="")),
                ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                ("scopes", models.TextField(blank=True, default="")),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_user_connections",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace_connection",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_connections",
                        to="db.slackworkspaceconnection",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack User Connection",
                "verbose_name_plural": "Slack User Connections",
                "db_table": "slack_user_connections",
                "ordering": ("-created_at",),
                "unique_together": {("workspace_connection", "slack_user_id"), ("workspace_connection", "user")},
            },
        ),
        migrations.CreateModel(
            name="SlackChannelSubscription",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("channel_id", models.CharField(db_index=True, max_length=50)),
                ("channel_name", models.CharField(blank=True, default="", max_length=255)),
                ("is_private_channel", models.BooleanField(default=False)),
                ("events", models.JSONField(default=list)),
                ("filter_payload", models.JSONField(default=dict)),
                ("filter_hash", models.CharField(blank=True, default="", max_length=64)),
                ("is_paused", models.BooleanField(default=False)),
                ("public_channel_ack", models.BooleanField(default=False)),
                ("last_posted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slack_channel_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_channel_subscriptions",
                        to="db.project",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_channel_subscriptions",
                        to="db.workspace",
                    ),
                ),
                (
                    "workspace_connection",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="channel_subscriptions",
                        to="db.slackworkspaceconnection",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack Channel Subscription",
                "verbose_name_plural": "Slack Channel Subscriptions",
                "db_table": "slack_channel_subscriptions",
                "ordering": ("-created_at",),
                "unique_together": {("workspace_connection", "channel_id", "project", "filter_hash")},
            },
        ),
        migrations.CreateModel(
            name="SlackThreadLink",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("channel_id", models.CharField(max_length=50)),
                ("thread_ts", models.CharField(max_length=32)),
                ("sync_enabled", models.BooleanField(default=True)),
                ("created_from", models.CharField(default="create", max_length=20)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_thread_links",
                        to="db.issue",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace_connection",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="thread_links",
                        to="db.slackworkspaceconnection",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack Thread Link",
                "verbose_name_plural": "Slack Thread Links",
                "db_table": "slack_thread_links",
                "ordering": ("-created_at",),
                "unique_together": {("channel_id", "thread_ts")},
            },
        ),
        migrations.CreateModel(
            name="SlackEventIdempotency",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("event_id", models.CharField(db_index=True, max_length=128, unique=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack Event Idempotency",
                "verbose_name_plural": "Slack Event Idempotency",
                "db_table": "slack_event_idempotency",
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="SlackAuditLog",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("action", models.CharField(max_length=64)),
                ("metadata", models.JSONField(default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slack_audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_audit_logs",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Slack Audit Log",
                "verbose_name_plural": "Slack Audit Logs",
                "db_table": "slack_audit_logs",
                "ordering": ("-created_at",),
            },
        ),
    ]
