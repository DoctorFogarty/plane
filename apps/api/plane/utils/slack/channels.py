# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from slack_sdk.errors import SlackApiError

from plane.utils.slack.tokens import bot_client


def _slack_error(exc: SlackApiError) -> str:
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        return str(response.get("error") or "")
    if response is not None and hasattr(response, "get"):
        return str(response.get("error") or "")
    return ""


def list_bot_channels(connection, *, max_channels: int = 1000) -> list[dict]:
    """Channels the bot is a member of (paginated). Private channels only appear after invite."""
    client = bot_client(connection)
    last_error: SlackApiError | None = None
    for types in ("public_channel,private_channel", "public_channel"):
        try:
            channels: list[dict] = []
            cursor = None
            while len(channels) < max_channels:
                kwargs = {
                    "exclude_archived": True,
                    "limit": min(200, max_channels - len(channels)),
                    "types": types,
                }
                if cursor:
                    kwargs["cursor"] = cursor
                result = client.users_conversations(**kwargs)
                for channel in result.get("channels") or []:
                    channel_id = channel.get("id")
                    if not channel_id:
                        continue
                    channels.append(
                        {
                            "id": channel_id,
                            "name": channel.get("name") or channel_id,
                            "is_private": bool(channel.get("is_private")),
                        }
                    )
                cursor = (result.get("response_metadata") or {}).get("next_cursor") or ""
                if not cursor:
                    break
            channels.sort(key=lambda item: (item.get("name") or "").lower())
            return channels
        except SlackApiError as exc:
            last_error = exc
            if _slack_error(exc) != "missing_scope":
                raise
    if last_error:
        raise last_error
    return []


def resolve_slack_channel(connection, channel_id: str) -> dict | None:
    try:
        result = bot_client(connection).conversations_info(channel=channel_id)
    except SlackApiError:
        return None
    channel = result.get("channel") or {}
    if not channel.get("id") or channel.get("is_member") is False:
        return None
    return {
        "id": channel.get("id"),
        "name": channel.get("name") or channel_id,
        "is_private": bool(channel.get("is_private")),
    }


def _unfurl_kwargs(event: dict, unfurls: dict) -> dict:
    kwargs: dict = {"unfurls": unfurls}
    if event.get("unfurl_id"):
        kwargs["unfurl_id"] = event["unfurl_id"]
        if event.get("source"):
            kwargs["source"] = event["source"]
        return kwargs
    kwargs["channel"] = event.get("channel")
    kwargs["ts"] = event.get("message_ts")
    return kwargs


def post_link_unfurls(connection, event: dict, unfurls: dict) -> None:
    client = bot_client(connection)
    channel_id = event.get("channel")
    if event.get("is_bot_user_member") is False and channel_id:
        try:
            client.conversations_join(channel=channel_id)
        except SlackApiError:
            pass
    kwargs = _unfurl_kwargs(event, unfurls)
    try:
        client.chat_unfurl(**kwargs)
        return
    except SlackApiError as exc:
        error = _slack_error(exc)
        if error in {"not_in_channel", "channel_not_found"} and channel_id:
            try:
                client.conversations_join(channel=channel_id)
                client.chat_unfurl(**kwargs)
                return
            except SlackApiError as retry_exc:
                raise retry_exc from exc
        raise
