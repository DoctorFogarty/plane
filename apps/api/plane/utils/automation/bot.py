# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction

from plane.db.models import BotTypeEnum, User, WorkspaceAutomationBot, WorkspaceMember


def get_or_create_automation_bot(workspace) -> User:
    """Return the Automation Bot user for a workspace, creating it if needed."""
    existing = (
        WorkspaceAutomationBot.objects.filter(workspace_id=workspace.id, deleted_at__isnull=True)
        .select_related("user")
        .first()
    )
    if existing:
        return existing.user

    with transaction.atomic():
        existing = (
            WorkspaceAutomationBot.objects.select_for_update()
            .filter(workspace_id=workspace.id, deleted_at__isnull=True)
            .select_related("user")
            .first()
        )
        if existing:
            return existing.user

        host = urlparse(settings.WEB_URL or "https://plane.so").hostname or "plane.so"
        bot_username = f"automation_bot_{workspace.id.hex[:16]}"
        user = User.objects.create(
            username=bot_username,
            email=f"{bot_username}@{host}",
            display_name="Automation Bot",
            first_name="Automation",
            last_name="Bot",
            is_bot=True,
            bot_type=BotTypeEnum.AUTOMATION,
            password=make_password(uuid.uuid4().hex),
            is_password_autoset=True,
        )

        # Member role is enough for activity attribution; actions write via the engine, not the API.
        WorkspaceMember.objects.get_or_create(
            workspace_id=workspace.id,
            member=user,
            defaults={"role": 15, "is_active": True},
        )
        WorkspaceAutomationBot.objects.create(workspace_id=workspace.id, user=user, project=None)
        return user
