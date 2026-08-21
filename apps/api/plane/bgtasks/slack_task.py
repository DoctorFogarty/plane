# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import logging
import time

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from slack_sdk.errors import SlackApiError

from plane.db.models import (
    Issue,
    IssueComment,
    SlackChannelSubscription,
    SlackThreadLink,
    SlackUserConnection,
    SlackWorkspaceConnection,
    UserNotificationPreference,
)
from plane.utils.exception_logger import log_exception
from plane.utils.slack.filters import DEFAULT_CHANNEL_EVENTS, events_allowed, subscription_matches_issue
from plane.utils.slack.handlers import (
    handle_block_actions,
    handle_event,
    handle_issue_submission,
    handle_message_action,
    handle_select_property_submission,
    handle_slash,
    issue_url,
)
from plane.utils.slack.runtime import workspace_connection_for_team
from plane.utils.slack.blocks import issue_card_blocks
from plane.utils.slack.tokens import bot_client, redact_tokens, refresh_bot_token
from plane.utils.slack.transitions import format_thread_comment_for_slack

logger = logging.getLogger("plane.slack")

CHANNEL_RATE_SECONDS = 1.0


@shared_task
def process_slack_event(payload: dict):
    try:
        handle_event(payload)
    except Exception:
        log_exception()


@shared_task
def process_slack_command(payload: dict):
    try:
        connection = workspace_connection_for_team(payload.get("team_id"))
        if not connection:
            return
        handle_slash(connection, payload)
    except Exception:
        log_exception()


@shared_task
def process_slack_interaction(payload: dict):
    try:
        team_id = (payload.get("team") or {}).get("id")
        connection = workspace_connection_for_team(team_id)
        if not connection:
            return
        ptype = payload.get("type")
        view = payload.get("view") or {}
        callback = view.get("callback_id")
        if ptype == "block_actions":
            handle_block_actions(connection, payload, allow_trigger=True)
        elif ptype == "view_submission":
            if callback in {"issue_state_submission", "issue_priority_submission"}:
                handle_select_property_submission(connection, payload)
            else:
                handle_issue_submission(connection, payload)
        elif ptype in {"message_action", "shortcut"}:
            handle_message_action(connection, payload)
    except Exception:
        log_exception()


@shared_task
def refresh_slack_token(connection_id: str):
    try:
        connection = SlackWorkspaceConnection.objects.filter(pk=connection_id).first()
        if connection:
            refresh_bot_token(connection)
    except Exception:
        log_exception()


@shared_task
def deliver_slack_dm(user_id: str, issue_id: str, text: str):
    try:
        issue = (
            Issue.all_objects.filter(pk=issue_id)
            .select_related("project", "workspace", "state", "type")
            .first()
        )
        if not issue:
            return
        link = (
            SlackUserConnection.objects.filter(user_id=user_id, workspace_connection__workspace_id=issue.workspace_id)
            .select_related("workspace_connection")
            .first()
        )
        if not link:
            return
        pref = UserNotificationPreference.objects.filter(user_id=user_id).first()
        if pref and not pref.slack_dm:
            return
        connection = link.workspace_connection
        if not connection.is_enabled:
            return
        if issue.deleted_at:
            identifier = f"{issue.project.identifier}-{issue.sequence_id}"
            bot_client(connection).chat_postMessage(
                channel=link.slack_user_id,
                text=f"{text}\n*{identifier}* {issue.name} (deleted)",
            )
            return
        bot_client(connection).chat_postMessage(
            channel=link.slack_user_id,
            text=text,
            blocks=issue_card_blocks(
                issue, issue.workspace.slug, issue_url(issue), headline=text, receiver_id=user_id
            ),
        )
    except SlackApiError as exc:
        logger.warning("Slack DM failed: %s", redact_tokens(str(exc)))
    except Exception:
        log_exception()


@shared_task
def deliver_slack_channel(subscription_id: str, issue_id: str, event_type, text: str, custom_property_ids=None):
    try:
        sub = _subscription_for_delivery(subscription_id)
        if not sub:
            return
        issue = _issue_for_channel_delivery(issue_id)
        if not issue or not _subscription_allows(sub, issue, event_type, custom_property_ids):
            return
        item = {"issue_id": str(issue.id), "text": text or "Work item updated"}
        now = timezone.now()
        if sub.last_posted_at and (now - sub.last_posted_at).total_seconds() < CHANNEL_RATE_SECONDS:
            _append_channel_pending(str(sub.id), item)
            wait = CHANNEL_RATE_SECONDS - (now - sub.last_posted_at).total_seconds()
            lock_key = _channel_flush_lock_key(str(sub.id))
            if cache.add(lock_key, "1", timeout=int(max(wait, 0.2)) + 5):
                flush_slack_channel_digest.apply_async(args=[str(sub.id)], countdown=max(wait, 0.05))
            return
        _post_channel_items(sub, [item])
    except SlackApiError as exc:
        logger.warning("Slack channel post failed: %s", redact_tokens(str(exc)))
    except Exception:
        log_exception()


@shared_task
def flush_slack_channel_digest(subscription_id: str):
    try:
        items = _take_channel_pending(subscription_id)
        cache.delete(_channel_flush_lock_key(subscription_id))
        if not items:
            return
        sub = _subscription_for_delivery(subscription_id)
        if not sub:
            return
        allowed = []
        for item in items:
            issue = _issue_for_channel_delivery(item.get("issue_id"))
            if issue and _subscription_allows(sub, issue, "create", None, skip_event_gate=True):
                allowed.append({**item, "issue": issue})
        if not allowed:
            return
        _post_channel_items(
            sub,
            [{"issue_id": item["issue_id"], "text": item["text"]} for item in allowed],
        )
        if cache.get(_channel_pending_key(subscription_id)):
            lock_key = _channel_flush_lock_key(subscription_id)
            if cache.add(lock_key, "1", timeout=6):
                flush_slack_channel_digest.apply_async(args=[subscription_id], countdown=CHANNEL_RATE_SECONDS)
    except SlackApiError as exc:
        logger.warning("Slack channel digest failed: %s", redact_tokens(str(exc)))
    except Exception:
        log_exception()


def _channel_pending_key(subscription_id: str) -> str:
    return f"slack:channel:pending:{subscription_id}"


def _channel_flush_lock_key(subscription_id: str) -> str:
    return f"slack:channel:flush:{subscription_id}"


def _channel_queue_lock_key(subscription_id: str) -> str:
    return f"slack:channel:qlock:{subscription_id}"


def _with_channel_queue_lock(subscription_id: str, fn):
    lock = _channel_queue_lock_key(subscription_id)
    for _ in range(25):
        if cache.add(lock, "1", timeout=2):
            try:
                return fn()
            finally:
                cache.delete(lock)
        time.sleep(0.02)
    return fn()


def _append_channel_pending(subscription_id: str, item: dict) -> None:
    def _append():
        key = _channel_pending_key(subscription_id)
        pending = cache.get(key) or []
        pending.append(item)
        cache.set(key, pending, timeout=120)

    _with_channel_queue_lock(subscription_id, _append)


def _take_channel_pending(subscription_id: str) -> list:
    def _take():
        key = _channel_pending_key(subscription_id)
        pending = cache.get(key) or []
        cache.delete(key)
        return pending

    return _with_channel_queue_lock(subscription_id, _take) or []


def _subscription_for_delivery(subscription_id: str):
    return (
        SlackChannelSubscription.objects.select_related("workspace_connection", "project")
        .filter(pk=subscription_id)
        .first()
    )


def _issue_for_channel_delivery(issue_id):
    if not issue_id:
        return None
    return (
        Issue.objects.filter(pk=issue_id)
        .select_related("project", "workspace", "state", "type")
        .prefetch_related("labels")
        .first()
    )


def _subscription_allows(sub, issue, event_type, custom_property_ids, *, skip_event_gate: bool = False) -> bool:
    if not sub or sub.is_paused:
        return False
    if not skip_event_gate:
        selected_events = sub.events if sub.events is not None else list(DEFAULT_CHANNEL_EVENTS)
        if not events_allowed(
            selected_events,
            event_type,
            custom_property_ids,
            getattr(sub, "custom_property_ids", None),
        ):
            return False
    if not sub.project.network and not sub.is_private_channel and not sub.public_channel_ack:
        return False
    return subscription_matches_issue(issue, sub.filter_payload)


def _post_channel_items(sub, items: list[dict]) -> None:
    if not items:
        return
    connection = sub.workspace_connection
    headlines = [item.get("text") or "Work item updated" for item in items]
    headline = "\n".join(headlines[:15])
    if len(headlines) > 15:
        headline = f"{headline}\n…and {len(headlines) - 15} more"
    last_issue = _issue_for_channel_delivery(items[-1].get("issue_id"))
    if not last_issue:
        return
    bot_client(connection).chat_postMessage(
        channel=sub.channel_id,
        text=headline,
        blocks=issue_card_blocks(last_issue, last_issue.workspace.slug, issue_url(last_issue), headline=headline),
    )
    sub.last_posted_at = timezone.now()
    sub.save(update_fields=["last_posted_at"])


@shared_task
def dispatch_slack_channel_event(project_id: str, issue_id: str, event_type, text: str, custom_property_ids=None):
    try:
        subs = SlackChannelSubscription.objects.filter(project_id=project_id, is_paused=False)
        for sub in subs:
            deliver_slack_channel.delay(str(sub.id), issue_id, event_type, text, custom_property_ids)
    except Exception:
        log_exception()


@shared_task
def sync_plane_comment_to_slack(comment_id: str):
    try:
        comment = (
            IssueComment.objects.select_related("issue", "issue__project", "issue__workspace", "actor")
            .filter(pk=comment_id)
            .first()
        )
        if not comment or comment.external_source == "SLACK_COMMENT":
            return
        links = SlackThreadLink.objects.filter(issue=comment.issue, sync_enabled=True).select_related(
            "workspace_connection"
        )
        for link in links:
            workspace_id = link.workspace_connection.workspace_id
            text = format_thread_comment_for_slack(comment, workspace_id)
            bot_client(link.workspace_connection).chat_postMessage(
                channel=link.channel_id, thread_ts=link.thread_ts, text=text
            )
    except Exception:
        log_exception()
