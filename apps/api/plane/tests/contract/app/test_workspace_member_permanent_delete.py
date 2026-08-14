# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for permanent workspace member deletion."""

from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Project, ProjectMember, User, WorkspaceMember


def _permanent_delete_url(slug: str, pk) -> str:
    return f"/api/workspaces/{slug}/members/{pk}/permanent/"


def _members_list_url(slug: str) -> str:
    return f"/api/workspaces/{slug}/members/"


def _make_user(email: str) -> User:
    local_part = email.split("@")[0]
    user = User.objects.create(email=email, username=local_part, first_name=local_part)
    user.set_password("test-password")
    user.save()
    return user


def _add_workspace_member(workspace, user, *, role: int, is_active: bool = True) -> WorkspaceMember:
    return WorkspaceMember.objects.create(
        workspace=workspace, member=user, role=role, is_active=is_active
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceMemberPermanentDelete:
    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_admin_can_delete_active_member(self, mock_soft_delete, workspace, create_user):
        victim = _make_user("active-member@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15)

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkspaceMember.objects.filter(pk=membership.id).exists()
        deleted = WorkspaceMember.all_objects.get(pk=membership.id)
        assert deleted.deleted_at is not None
        mock_soft_delete.assert_called()

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_admin_can_delete_suspended_member(self, mock_soft_delete, workspace, create_user):
        victim = _make_user("suspended-member@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15, is_active=False)

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkspaceMember.objects.filter(pk=membership.id).exists()
        deleted = WorkspaceMember.all_objects.get(pk=membership.id)
        assert deleted.deleted_at is not None

    def test_non_admin_cannot_delete_member(self, workspace, create_user):
        member_user = _make_user("regular-member@plane.so")
        _add_workspace_member(workspace, member_user, role=15)
        victim = _make_user("victim@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15)

        client = APIClient()
        client.force_authenticate(user=member_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert WorkspaceMember.objects.filter(pk=membership.id, deleted_at__isnull=True).exists()

    def test_cannot_delete_self(self, workspace, create_user):
        other_admin = _make_user("other-admin@plane.so")
        _add_workspace_member(workspace, other_admin, role=20)
        self_membership = WorkspaceMember.objects.get(workspace=workspace, member=create_user)

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, self_membership.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "yourself" in response.data["error"].lower()
        assert WorkspaceMember.objects.filter(pk=self_membership.id).exists()

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_can_delete_other_admin_when_another_active_admin_remains(
        self, mock_soft_delete, workspace, create_user
    ):
        other_admin = _make_user("peer-admin@plane.so")
        other_membership = _add_workspace_member(workspace, other_admin, role=20)

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, other_membership.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert WorkspaceMember.objects.filter(
            workspace=workspace, member=create_user, role=20, is_active=True
        ).exists()

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_can_delete_suspended_admin(self, mock_soft_delete, workspace, create_user):
        """Suspended admins are not active admins, so they can be permanently deleted."""
        suspended_admin = _make_user("suspended-admin@plane.so")
        membership = _add_workspace_member(workspace, suspended_admin, role=20, is_active=False)

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkspaceMember.objects.filter(pk=membership.id).exists()

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_deleted_member_not_in_list(self, mock_soft_delete, workspace, create_user):
        victim = _make_user("listed-member@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15)

        client = APIClient()
        client.force_authenticate(user=create_user)
        client.delete(_permanent_delete_url(workspace.slug, membership.id))

        list_response = client.get(_members_list_url(workspace.slug))
        assert list_response.status_code == status.HTTP_200_OK
        member_ids = {str(row["id"]) for row in list_response.data}
        assert str(membership.id) not in member_ids

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_soft_deletes_project_memberships(self, mock_soft_delete, workspace, create_user):
        victim = _make_user("project-member@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15)
        project = Project.objects.create(
            name="Test Project",
            identifier="TSTM",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(
            workspace=workspace, project=project, member=create_user, role=20, is_active=True
        )
        project_membership = ProjectMember.objects.create(
            workspace=workspace, project=project, member=victim, role=15, is_active=True
        )

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectMember.objects.filter(pk=project_membership.id).exists()
        deleted_pm = ProjectMember.all_objects.get(pk=project_membership.id)
        assert deleted_pm.deleted_at is not None

    @patch("plane.db.mixins.soft_delete_related_objects.delay")
    def test_reinvite_can_recreate_membership(self, mock_soft_delete, workspace, create_user):
        victim = _make_user("reinvite@plane.so")
        membership = _add_workspace_member(workspace, victim, role=15)
        membership_id = membership.id

        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, membership_id))
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Soft-deleted row is hidden from default manager; a new membership can be created
        new_membership = WorkspaceMember.objects.create(
            workspace=workspace, member=victim, role=15, is_active=True
        )
        assert new_membership.id != membership_id
        assert WorkspaceMember.objects.filter(workspace=workspace, member=victim, is_active=True).count() == 1

    def test_not_found_for_missing_member(self, workspace, create_user):
        client = APIClient()
        client.force_authenticate(user=create_user)
        response = client.delete(_permanent_delete_url(workspace.slug, uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND
