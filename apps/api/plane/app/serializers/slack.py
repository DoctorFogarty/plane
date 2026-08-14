# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import SlackAuditLog, SlackChannelSubscription, SlackUserConnection, SlackWorkspaceConnection


class SlackWorkspaceConnectionSerializer(BaseSerializer):
    class Meta:
        model = SlackWorkspaceConnection
        fields = (
            "id",
            "workspace",
            "workspace_integration",
            "team_id",
            "team_name",
            "bot_user_id",
            "scopes",
            "is_enabled",
            "app_uninstalled_at",
            "created_at",
            "updated_at",
        )


class SlackUserConnectionSerializer(BaseSerializer):
    class Meta:
        model = SlackUserConnection
        fields = (
            "id",
            "slack_user_id",
            "slack_email",
            "scopes",
            "created_at",
            "updated_at",
        )


class SlackChannelSubscriptionSerializer(BaseSerializer):
    class Meta:
        model = SlackChannelSubscription
        fields = "__all__"
        read_only_fields = (
            "id",
            "workspace",
            "workspace_connection",
            "project",
            "filter_hash",
            "created_at",
            "updated_at",
            "last_posted_at",
        )


class SlackAuditLogSerializer(BaseSerializer):
    class Meta:
        model = SlackAuditLog
        fields = ("id", "action", "metadata", "actor", "created_at")
