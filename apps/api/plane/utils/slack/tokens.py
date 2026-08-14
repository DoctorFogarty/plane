# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import logging
import time
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from plane.utils.slack.config import get_slack_app_config

logger = logging.getLogger("plane.slack")

_TOKEN_LOG_MARKERS = ("xoxb-", "xoxp-", "xoxe-", "xapp-")


def redact_tokens(value: str) -> str:
    text = value or ""
    for marker in _TOKEN_LOG_MARKERS:
        while marker in text:
            start = text.index(marker)
            end = start + 8
            while end < len(text) and text[end] not in " \n\t\"'":
                end += 1
            text = text[:start] + "[redacted-token]" + text[end:]
    return text


def refresh_bot_token(connection) -> str:
    """Refresh bot token with a single-flight lock. Returns access token."""
    lock_key = f"slack-token-refresh:{connection.id}"
    acquired = cache.add(lock_key, "1", timeout=30)
    if not acquired:
        time.sleep(0.25)
        connection.refresh_from_db()
        return connection.get_bot_access_token()

    try:
        config = get_slack_app_config()
        refresh_token = connection.get_bot_refresh_token()
        if not refresh_token:
            return connection.get_bot_access_token()
        client = WebClient()
        resp = client.oauth_v2_access(
            client_id=config["client_id"],
            client_secret=config["client_secret"],
            grant_type="refresh_token",
            refresh_token=refresh_token,
        )
        access = resp.get("access_token") or ""
        new_refresh = resp.get("refresh_token") or refresh_token
        expires_in = int(resp.get("expires_in") or 0)
        connection.set_bot_tokens(access, new_refresh)
        if expires_in:
            connection.token_expires_at = timezone.now() + timedelta(seconds=max(expires_in - 60, 0))
        connection.save(update_fields=["bot_access_token", "bot_refresh_token", "token_expires_at", "updated_at"])
        return access
    except SlackApiError as exc:
        logger.warning("Slack token refresh failed: %s", redact_tokens(str(exc)))
        return connection.get_bot_access_token()
    finally:
        cache.delete(lock_key)


def bot_client(connection) -> WebClient:
    token = connection.get_bot_access_token()
    if connection.token_expires_at and connection.token_expires_at <= timezone.now():
        token = refresh_bot_token(connection)
    return WebClient(token=token)
