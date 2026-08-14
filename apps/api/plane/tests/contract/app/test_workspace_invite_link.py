# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    User,
    Workspace,
    WorkspaceInviteLink,
    WorkspaceMember,
    WorkspaceMemberInvite,
)


@pytest.mark.contract
class TestWorkspaceInviteLinkAPI:
    """Test workspace shareable invite link endpoints"""

    @pytest.mark.django_db
    def test_create_invite_link(self, session_client, workspace):
        url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"role": 15}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == 15
        assert response.data["is_active"] is True
        assert "invite_link" in response.data
        assert workspace.slug in response.data["invite_link"]
        assert WorkspaceInviteLink.objects.filter(workspace=workspace).count() == 1

    @pytest.mark.django_db
    def test_create_invite_link_rejects_admin_role(self, session_client, workspace):
        url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        response = session_client.post(url, {"role": 20}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert WorkspaceInviteLink.objects.filter(workspace=workspace).count() == 0

    @pytest.mark.django_db
    def test_regenerate_invite_link(self, session_client, workspace):
        url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        first = session_client.post(url, {"role": 15}, format="json")
        old_anchor = first.data["anchor"]

        second = session_client.post(url, {"role": 5}, format="json")
        assert second.status_code == status.HTTP_201_CREATED
        assert second.data["anchor"] != old_anchor
        assert second.data["role"] == 5
        assert WorkspaceInviteLink.objects.filter(workspace=workspace).count() == 1

    @pytest.mark.django_db
    def test_list_invite_link(self, session_client, workspace):
        list_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        empty = session_client.get(list_url)
        assert empty.status_code == status.HTTP_200_OK
        assert empty.data == []

        session_client.post(list_url, {"role": 15}, format="json")
        listed = session_client.get(list_url)
        assert listed.status_code == status.HTTP_200_OK
        assert len(listed.data) == 1

    @pytest.mark.django_db
    def test_disable_and_delete_invite_link(self, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        pk = created.data["id"]

        patch_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug, "pk": pk})
        disabled = session_client.patch(patch_url, {"is_active": False}, format="json")
        assert disabled.status_code == status.HTTP_200_OK
        assert disabled.data["is_active"] is False

        deleted = session_client.delete(patch_url)
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert WorkspaceInviteLink.objects.filter(workspace=workspace).count() == 0

    @pytest.mark.django_db
    def test_guest_cannot_create_invite_link(self, api_client, workspace, create_user):
        guest = User.objects.create(
            email="guest@plane.so",
            username="guest_user",
        )
        guest.set_password("password")
        guest.save()
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        api_client.force_authenticate(user=guest)

        url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        response = api_client.post(url, {"role": 15}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_public_get_metadata(self, api_client, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        code = created.data["anchor"]

        public_url = reverse(
            "workspace-invite-link-public",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.get(public_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["workspace"]["slug"] == workspace.slug
        assert response.data["role"] == 15
        assert "anchor" not in response.data

    @pytest.mark.django_db
    def test_public_get_inactive_returns_404(self, api_client, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        pk = created.data["id"]
        code = created.data["anchor"]

        patch_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug, "pk": pk})
        session_client.patch(patch_url, {"is_active": False}, format="json")

        public_url = reverse(
            "workspace-invite-link-public",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.get(public_url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_claim_creates_email_invite(self, api_client, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        code = created.data["anchor"]

        claim_url = reverse(
            "workspace-invite-link-claim",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.post(claim_url, {"email": "invitee@plane.so"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["email"] == "invitee@plane.so"
        assert response.data["role"] == 15
        assert response.data["token"]
        assert response.data["accepted"] is True
        invite = WorkspaceMemberInvite.objects.get(email="invitee@plane.so", workspace=workspace)
        assert invite.accepted is True
        assert invite.responded_at is not None

    @pytest.mark.django_db
    def test_claim_rejects_existing_member(self, api_client, session_client, workspace, create_user):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        code = created.data["anchor"]

        claim_url = reverse(
            "workspace-invite-link-claim",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.post(claim_url, {"email": create_user.email}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_join_via_invite_link(self, api_client, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        code = created.data["anchor"]

        joiner = User.objects.create(email="joiner@plane.so", username="joiner_user")
        joiner.set_password("password")
        joiner.save()
        api_client.force_authenticate(user=joiner)

        join_url = reverse(
            "workspace-invite-link-join",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.post(join_url, {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert WorkspaceMember.objects.filter(workspace=workspace, member=joiner, is_active=True, role=15).exists()

    @pytest.mark.django_db
    def test_join_inactive_link_returns_404(self, api_client, session_client, workspace):
        create_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug})
        created = session_client.post(create_url, {"role": 15}, format="json")
        pk = created.data["id"]
        code = created.data["anchor"]

        patch_url = reverse("workspace-invite-links", kwargs={"slug": workspace.slug, "pk": pk})
        session_client.patch(patch_url, {"is_active": False}, format="json")

        joiner = User.objects.create(email="joiner2@plane.so", username="joiner2_user")
        joiner.set_password("password")
        joiner.save()
        api_client.force_authenticate(user=joiner)

        join_url = reverse(
            "workspace-invite-link-join",
            kwargs={"slug": workspace.slug, "code": code},
        )
        response = api_client.post(join_url, {}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND
