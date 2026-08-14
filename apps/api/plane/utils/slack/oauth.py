# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from urllib.parse import urlencode

from django.core.exceptions import ImproperlyConfigured
from slack_sdk import WebClient

from plane.utils.slack.config import BOT_SCOPES, USER_SCOPES, get_slack_app_config
from plane.utils.slack.urls import public_origin


def slack_oauth_redirect_uri(kind: str) -> str:
    origin = public_origin()
    if not origin:
        raise ImproperlyConfigured("WEB_URL or APP_BASE_URL must be an absolute URL for Slack OAuth")
    return f"{origin}/api/hooks/slack/oauth/{kind}"


def slack_authorize_url(*, state: str, user_only: bool = False) -> str:
    config = get_slack_app_config()
    params = {
        "client_id": config["client_id"],
        "redirect_uri": slack_oauth_redirect_uri("user" if user_only else "workspace"),
        "state": state,
        "user_scope": USER_SCOPES,
    }
    if user_only:
        params["scope"] = ""
    else:
        params["scope"] = BOT_SCOPES
    return f"https://slack.com/oauth/v2/authorize?{urlencode(params)}"


def exchange_oauth_code(code: str, *, user_only: bool = False) -> dict:
    config = get_slack_app_config()
    client = WebClient()
    return client.oauth_v2_access(
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        code=code,
        redirect_uri=slack_oauth_redirect_uri("user" if user_only else "workspace"),
    ).data
