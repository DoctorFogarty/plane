# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from plane.db.models import IssueType
from plane.utils.slack.urls import extract_uppercase_identifiers

META_COMMANDS = {"help", "notify", "logout", "unsubscribe", "invite", "manage", "connect"}
MANAGE_COMMANDS = {"manage", "connect"}
CREATE_COMMANDS = {"", "create"}


def first_token(text: str) -> str:
    parts = (text or "").strip().split()
    return (parts[0] if parts else "").lower()


def should_open_manage_modal(text: str) -> bool:
    return first_token(text) in MANAGE_COMMANDS


def should_open_create_modal(text: str) -> bool:
    token = first_token(text)
    if token in META_COMMANDS:
        return False
    if token in CREATE_COMMANDS:
        return True
    if extract_uppercase_identifiers(text or ""):
        return False
    return True


def workspace_type_names(connection) -> set[str]:
    return set(
        IssueType.objects.filter(workspace=connection.workspace, is_active=True, is_epic=False).values_list(
            "name", flat=True
        )
    )


def parse_slash_create_args(text: str, type_names: set[str] | None = None) -> tuple[str, str]:
    """Return `(type_name, summary)` from `/plane create [type] [summary]` or free text."""
    parts = (text or "").strip().split()
    if parts and parts[0].lower() == "create":
        parts = parts[1:]
    if not parts:
        return "", ""
    lookup = {name.lower(): name for name in (type_names or set()) if name}
    if parts[0].lower() in lookup:
        return lookup[parts[0].lower()], " ".join(parts[1:])
    return "", " ".join(parts)
