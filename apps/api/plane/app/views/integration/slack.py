# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from urllib.parse import parse_qs

from django.contrib.auth.hashers import make_password
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from slack_sdk.errors import SlackApiError

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.slack import (
    SlackAuditLogSerializer,
    SlackChannelSubscriptionSerializer,
    SlackUserConnectionSerializer,
    SlackWorkspaceConnectionSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.slack_task import process_slack_command, process_slack_event, process_slack_interaction
from plane.db.models import (
    APIToken,
    Integration,
    Project,
    SlackAuditLog,
    SlackChannelSubscription,
    SlackUserConnection,
    SlackWorkspaceConnection,
    User,
    UserNotificationPreference,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.utils.slack.config import get_slack_app_config
from plane.utils.slack.filters import DEFAULT_CHANNEL_EVENTS
from plane.utils.slack.handlers import (
    handle_block_actions,
    handle_event,
    handle_message_action,
    open_create_modal,
    open_manage_modal,
    should_open_create_modal,
    view_submission_response,
)
from plane.utils.exception_logger import log_exception
from plane.utils.slack.channels import list_bot_channels, resolve_slack_channel
from plane.utils.slack.oauth import exchange_oauth_code, slack_authorize_url
from plane.utils.slack.oauth_state import sign_oauth_state, unsign_oauth_state
from plane.utils.slack.runtime import mapped_user, workspace_connection_for_team
from plane.utils.slack.signing import verify_slack_signature
from plane.utils.slack.slash import parse_slash_create_args, should_open_manage_modal, workspace_type_names
from plane.utils.slack.tokens import redact_tokens
from plane.utils.slack.urls import public_origin


def _slack_ack():
    """Empty 200. Slack slash and interactivity treat JSON like {"ok": true} as a bad payload."""
    return HttpResponse(status=200)


def ensure_slack_integration() -> Integration:
    integration, _ = Integration.objects.get_or_create(
        provider="slack",
        defaults={
            "title": "Slack",
            "author": "Plane",
            "avatar_url": "",
            "description": {"content": "Connect Slack to create work items, unfurl links, and send notifications."},
            "verified": True,
            "network": 2,
        },
    )
    return integration


def _verify_slack_request(request) -> bool:
    config = get_slack_app_config()
    return verify_slack_signature(
        request.body,
        request.headers.get("X-Slack-Request-Timestamp"),
        request.headers.get("X-Slack-Signature"),
        config.get("signing_secret") or "",
    )


def _settings_redirect(slug: str) -> str:
    base = public_origin()
    if slug:
        return f"{base}/{slug}/settings/integrations"
    return f"{base}/"


def _create_slack_bot(workspace) -> tuple[User, APIToken]:
    bot_user = User.objects.create(
        email=f"slack-bot-{workspace.id}-{uuid.uuid4().hex[:8]}@plane.so",
        username=f"slack-bot-{uuid.uuid4().hex[:12]}",
        display_name="Slack",
        first_name="Slack",
        is_bot=True,
        is_password_autoset=True,
        password=make_password(uuid.uuid4().hex),
    )
    api_token = APIToken.objects.create(
        user=bot_user,
        user_type=1,
        workspace=workspace,
        label="Slack Integration",
        is_service=True,
    )
    WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        member=bot_user,
        defaults={"role": ROLE.MEMBER.value, "is_active": True},
    )
    return bot_user, api_token


class SlackEventsEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not _verify_slack_request(request):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)
        payload = request.data if isinstance(request.data, dict) else json.loads(request.body.decode() or "{}")
        if payload.get("type") == "url_verification":
            return Response({"challenge": payload.get("challenge")}, status=status.HTTP_200_OK)
        event = payload.get("event") or {}
        if payload.get("type") == "event_callback" and event.get("type") == "link_shared":
            try:
                handle_event(payload)
            except Exception:
                log_exception()
            return Response({"ok": True}, status=status.HTTP_200_OK)
        process_slack_event.delay(payload)
        return Response({"ok": True}, status=status.HTTP_200_OK)


class SlackInteractiveEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not _verify_slack_request(request):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)
        raw = request.POST.get("payload") or request.data.get("payload")
        payload = json.loads(raw) if isinstance(raw, str) else (raw or {})
        team_id = (payload.get("team") or {}).get("id")
        connection = workspace_connection_for_team(team_id)
        ptype = payload.get("type")
        callback = (payload.get("view") or {}).get("callback_id")
        if connection and ptype == "view_submission" and callback in {
            "project_selection",
            "link_thread",
            "channel_manage",
        }:
            result = view_submission_response(connection, payload)
            if result:
                return Response(result, status=status.HTTP_200_OK)
        if connection and ptype == "block_actions":
            handle_block_actions(connection, payload, allow_trigger=True)
            return _slack_ack()
        if connection and ptype in {"message_action", "shortcut"}:
            handle_message_action(connection, payload)
            return _slack_ack()
        process_slack_interaction.delay(payload)
        return _slack_ack()


class SlackCommandsEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not _verify_slack_request(request):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)
        payload = {
            key: request.POST.get(key) or (request.data.get(key) if hasattr(request.data, "get") else None)
            for key in ("team_id", "user_id", "channel_id", "trigger_id", "text", "command", "response_url")
        }
        if not payload.get("team_id"):
            parsed = parse_qs(request.body.decode())
            payload = {k: (v[0] if v else "") for k, v in parsed.items()}
        connection = workspace_connection_for_team(payload.get("team_id"))
        text = payload.get("text") or ""
        if connection and payload.get("trigger_id"):
            user = mapped_user(connection, payload.get("user_id"))
            if user:
                try:
                    if should_open_manage_modal(text):
                        open_manage_modal(connection, user, payload.get("trigger_id"), payload.get("channel_id"))
                        return _slack_ack()
                    if should_open_create_modal(text):
                        type_hint, summary = parse_slash_create_args(text, workspace_type_names(connection))
                        open_create_modal(
                            connection,
                            user,
                            payload.get("trigger_id"),
                            payload.get("channel_id"),
                            prefill=summary,
                            type_hint=type_hint,
                        )
                        return _slack_ack()
                except Exception:
                    log_exception()
        process_slack_command.delay(payload)
        return _slack_ack()


class SlackWorkspaceOAuthInstallEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        config = get_slack_app_config()
        if not config["is_configured"]:
            return Response({"error": "Slack is not configured"}, status=status.HTTP_400_BAD_REQUEST)
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        state = sign_oauth_state({"workspace_slug": slug, "user_id": str(request.user.id), "nonce": uuid.uuid4().hex})
        try:
            return HttpResponseRedirect(slack_authorize_url(state=state, user_only=False))
        except ImproperlyConfigured:
            return Response({"error": "Slack OAuth redirect URL is not configured"}, status=status.HTTP_400_BAD_REQUEST)


class SlackUserOAuthInstallEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        config = get_slack_app_config()
        if not config["is_configured"]:
            return Response({"error": "Slack is not configured"}, status=status.HTTP_400_BAD_REQUEST)
        if not SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_enabled=True).exists():
            return Response({"error": "Connect Slack to this workspace first"}, status=status.HTTP_400_BAD_REQUEST)
        state = sign_oauth_state({"workspace_slug": slug, "user_id": str(request.user.id), "nonce": uuid.uuid4().hex})
        try:
            return HttpResponseRedirect(slack_authorize_url(state=state, user_only=True))
        except ImproperlyConfigured:
            return Response({"error": "Slack OAuth redirect URL is not configured"}, status=status.HTTP_400_BAD_REQUEST)


class SlackWorkspaceOAuthCallbackEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        if request.GET.get("error"):
            return HttpResponseRedirect(_settings_redirect(""))
        state = unsign_oauth_state(request.GET.get("state") or "")
        code = request.GET.get("code")
        if not state or not code:
            return HttpResponseRedirect(_settings_redirect(""))
        slug = state.get("workspace_slug")
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return HttpResponseRedirect(_settings_redirect(""))
        try:
            data = exchange_oauth_code(code, user_only=False)
        except SlackApiError:
            return HttpResponseRedirect(_settings_redirect(slug))
        team = data.get("team") or {}
        team_id = team.get("id")
        if not team_id:
            return HttpResponseRedirect(_settings_redirect(slug))
        existing = SlackWorkspaceConnection.objects.filter(team_id=team_id).first()
        if existing and existing.workspace_id != workspace.id:
            return Response({"error": "CANNOT_CREATE_MULTIPLE_CONNECTIONS"}, status=status.HTTP_400_BAD_REQUEST)
        installer = User.objects.filter(pk=state.get("user_id")).first()
        integration = ensure_slack_integration()
        with transaction.atomic():
            workspace_integration = WorkspaceIntegration.objects.filter(
                workspace=workspace, integration=integration
            ).first()
            if not workspace_integration:
                bot_user, api_token = _create_slack_bot(workspace)
                workspace_integration = WorkspaceIntegration.objects.create(
                    workspace=workspace,
                    integration=integration,
                    actor=bot_user,
                    api_token=api_token,
                    config={"team_id": team_id},
                    metadata={"team": team},
                )
            connection = existing or SlackWorkspaceConnection(
                workspace=workspace, workspace_integration=workspace_integration
            )
            connection.workspace = workspace
            connection.workspace_integration = workspace_integration
            connection.team_id = team_id
            connection.team_name = team.get("name") or ""
            connection.bot_user_id = data.get("bot_user_id") or ""
            connection.scopes = data.get("scope") or ""
            connection.installed_by = installer
            connection.is_enabled = True
            connection.app_uninstalled_at = None
            expires_in = int(data.get("expires_in") or 0)
            connection.set_bot_tokens(data.get("access_token") or "", data.get("refresh_token") or "")
            if expires_in:
                connection.token_expires_at = timezone.now() + timedelta(seconds=max(expires_in - 60, 0))
            connection.save()
            SlackAuditLog.objects.create(
                workspace=workspace, actor=installer, action="slack.workspace.installed", metadata={"team_id": team_id}
            )
        return HttpResponseRedirect(_settings_redirect(slug))


class SlackUserOAuthCallbackEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        state = unsign_oauth_state(request.GET.get("state") or "")
        code = request.GET.get("code")
        if not state or not code:
            return HttpResponseRedirect(_settings_redirect(""))
        slug = state.get("workspace_slug")
        user = User.objects.filter(pk=state.get("user_id")).first()
        workspace = Workspace.objects.filter(slug=slug).first()
        if not user or not workspace:
            return HttpResponseRedirect(_settings_redirect(slug or ""))
        try:
            data = exchange_oauth_code(code, user_only=True)
        except SlackApiError:
            return HttpResponseRedirect(_settings_redirect(slug))
        team_id = (data.get("team") or {}).get("id")
        connection = (
            workspace_connection_for_team(team_id)
            if team_id
            else SlackWorkspaceConnection.objects.filter(workspace=workspace, is_enabled=True).first()
        )
        if not connection or connection.workspace_id != workspace.id:
            return HttpResponseRedirect(_settings_redirect(slug))
        authed = data.get("authed_user") or {}
        slack_user_id = authed.get("id")
        if not slack_user_id:
            return HttpResponseRedirect(_settings_redirect(slug))
        link, _ = SlackUserConnection.objects.update_or_create(
            workspace_connection=connection,
            user=user,
            defaults={"slack_user_id": slack_user_id, "scopes": authed.get("scope") or ""},
        )
        link.slack_user_id = slack_user_id
        link.set_user_tokens(authed.get("access_token") or "", authed.get("refresh_token") or "")
        link.save()
        pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
        if not pref.slack_dm:
            pref.slack_dm = True
            pref.save(update_fields=["slack_dm"])
        SlackAuditLog.objects.create(
            workspace=workspace, actor=user, action="slack.user.linked", metadata={"slack_user_id": slack_user_id}
        )
        return HttpResponseRedirect(_settings_redirect(slug))


class SlackConnectionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_enabled=True).first()
        if not connection:
            return Response(None, status=status.HTTP_200_OK)
        return Response(SlackWorkspaceConnectionSerializer(connection).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug).first()
        if not connection:
            return Response(status=status.HTTP_204_NO_CONTENT)
        workspace_integration = connection.workspace_integration
        SlackAuditLog.objects.create(
            workspace=connection.workspace, actor=request.user, action="slack.workspace.disconnected", metadata={}
        )
        connection.delete()
        if workspace_integration:
            actor = workspace_integration.actor
            token = workspace_integration.api_token
            workspace_integration.delete()
            if token:
                token.delete()
            if actor and actor.is_bot:
                WorkspaceMember.objects.filter(member=actor).delete()
                actor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackUserConnectionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        link = SlackUserConnection.objects.filter(
            user=request.user, workspace_connection__workspace__slug=slug
        ).first()
        if not link:
            return Response(None, status=status.HTTP_200_OK)
        return Response(SlackUserConnectionSerializer(link).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug):
        SlackUserConnection.objects.filter(user=request.user, workspace_connection__workspace__slug=slug).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackChannelSubscriptionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def get(self, request, slug, project_id):
        subs = SlackChannelSubscription.objects.filter(workspace__slug=slug, project_id=project_id)
        return Response(SlackChannelSubscriptionSerializer(subs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_enabled=True).first()
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if not connection or not project:
            return Response({"error": "Slack is not connected"}, status=status.HTTP_400_BAD_REQUEST)
        channel_id = request.data.get("channel_id")
        if not channel_id:
            return Response({"error": "channel_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        resolved = resolve_slack_channel(connection, channel_id)
        if not resolved:
            return Response(
                {"error": "Invite the Plane bot to that channel, then try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_private = bool(resolved.get("is_private"))
        public_ack = bool(request.data.get("public_channel_ack"))
        if project.network == 0 and not is_private and not public_ack:
            return Response(
                {"error": "Secret projects require public_channel_ack to post in a public Slack channel"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sub = SlackChannelSubscription(
            workspace_connection=connection,
            project=project,
            workspace=project.workspace,
            channel_id=resolved["id"],
            channel_name=request.data.get("channel_name") or resolved.get("name") or "",
            is_private_channel=is_private,
            events=(
                request.data.get("events")
                if isinstance(request.data.get("events"), list)
                else list(DEFAULT_CHANNEL_EVENTS)
            ),
            filter_payload=request.data.get("filter_payload") or {},
            custom_property_ids=(
                request.data.get("custom_property_ids")
                if isinstance(request.data.get("custom_property_ids"), list)
                else []
            ),
            public_channel_ack=public_ack,
            created_by=request.user,
        )
        sub.save()
        SlackAuditLog.objects.create(
            workspace=project.workspace,
            actor=request.user,
            action="slack.subscription.created",
            metadata={"channel_id": channel_id, "project_id": str(project.id)},
        )
        return Response(SlackChannelSubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)


class SlackChannelSubscriptionDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def patch(self, request, slug, project_id, pk):
        sub = SlackChannelSubscription.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if not sub:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        for field in (
            "is_paused",
            "events",
            "filter_payload",
            "custom_property_ids",
            "public_channel_ack",
            "channel_name",
            "is_private_channel",
        ):
            if field in request.data:
                setattr(sub, field, request.data[field])
        sub.save()
        SlackAuditLog.objects.create(
            workspace=sub.workspace,
            actor=request.user,
            action="slack.subscription.updated",
            metadata={"id": str(sub.id)},
        )
        return Response(SlackChannelSubscriptionSerializer(sub).data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, pk):
        sub = SlackChannelSubscription.objects.filter(workspace__slug=slug, project_id=project_id, pk=pk).first()
        if not sub:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        SlackAuditLog.objects.create(
            workspace=sub.workspace,
            actor=request.user,
            action="slack.subscription.deleted",
            metadata={"id": str(sub.id)},
        )
        sub.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackChannelListEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        connection = SlackWorkspaceConnection.objects.filter(workspace__slug=slug, is_enabled=True).first()
        if not connection:
            return Response({"channels": []}, status=status.HTTP_200_OK)
        try:
            return Response({"channels": list_bot_channels(connection)}, status=status.HTTP_200_OK)
        except SlackApiError as exc:
            return Response({"error": redact_tokens(str(exc)), "channels": []}, status=status.HTTP_200_OK)


class SlackAuditLogEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        logs = SlackAuditLog.objects.filter(workspace__slug=slug)[:100]
        return Response(SlackAuditLogSerializer(logs, many=True).data, status=status.HTTP_200_OK)
