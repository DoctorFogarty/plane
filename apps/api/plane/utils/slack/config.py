# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import os
from typing import Any

from plane.license.utils.instance_value import get_configuration_value

BOT_SCOPES = ",".join(
    [
        "commands",
        "chat:write",
        "channels:history",
        "channels:join",
        "channels:read",
        "groups:history",
        "groups:read",
        "im:write",
        "im:history",
        "links:read",
        "links:write",
        "users:read",
        "users:read.email",
        "files:read",
        "team:read",
        "app_mentions:read",
    ]
)

USER_SCOPES = "users:read,users:read.email"


def get_slack_app_config() -> dict[str, Any]:
    client_id, client_secret, signing_secret, app_token = get_configuration_value(
        [
            {"key": "SLACK_CLIENT_ID", "default": os.environ.get("SLACK_CLIENT_ID", "")},
            {"key": "SLACK_CLIENT_SECRET", "default": os.environ.get("SLACK_CLIENT_SECRET", "")},
            {"key": "SLACK_SIGNING_SECRET", "default": os.environ.get("SLACK_SIGNING_SECRET", "")},
            {"key": "SLACK_APP_TOKEN", "default": os.environ.get("SLACK_APP_TOKEN", "")},
        ]
    )
    return {
        "client_id": client_id or "",
        "client_secret": client_secret or "",
        "signing_secret": signing_secret or "",
        "app_token": app_token or "",
        "is_configured": bool(client_id and client_secret and signing_secret),
    }
