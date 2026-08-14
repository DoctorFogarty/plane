# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from uuid import uuid4

from plane.db.models import Workspace, WorkspaceInviteLink


@pytest.mark.unit
class TestWorkspaceInviteLinkModel:
    """Test the WorkspaceInviteLink model"""

    @pytest.mark.django_db
    def test_invite_link_creation(self, create_user):
        workspace = Workspace.objects.create(
            name="Invite Link Workspace",
            slug="invite-link-workspace",
            id=uuid4(),
            owner=create_user,
        )

        invite_link = WorkspaceInviteLink.objects.create(
            workspace=workspace,
            role=15,
            is_active=True,
            created_by=create_user,
        )

        assert invite_link.id is not None
        assert invite_link.anchor
        assert invite_link.role == 15
        assert invite_link.is_active is True
        assert invite_link.workspace == workspace

    @pytest.mark.django_db
    def test_only_one_active_invite_link_per_workspace(self, create_user):
        workspace = Workspace.objects.create(
            name="Invite Link Workspace",
            slug="invite-link-workspace-2",
            id=uuid4(),
            owner=create_user,
        )

        first = WorkspaceInviteLink.objects.create(workspace=workspace, role=15, created_by=create_user)
        first.delete()

        second = WorkspaceInviteLink.objects.create(workspace=workspace, role=5, created_by=create_user)
        assert WorkspaceInviteLink.objects.filter(workspace=workspace).count() == 1
        assert second.role == 5
        assert second.anchor != first.anchor
