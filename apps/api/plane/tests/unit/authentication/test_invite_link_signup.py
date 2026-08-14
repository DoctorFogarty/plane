# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch
from uuid import uuid4

import pytest
from django.test import RequestFactory

from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.credentials.email import EmailProvider
from plane.db.models import User, Workspace, WorkspaceInviteLink, WorkspaceMemberInvite


@pytest.mark.unit
class TestInviteLinkSignupUnlock:
    """Invite-only instances must allow signup when a shareable invite link is present."""

    @pytest.fixture
    def invite_link_workspace(self, create_user):
        workspace = Workspace.objects.create(
            name="Invite Signup Workspace",
            slug="invite-signup-ws",
            id=uuid4(),
            owner=create_user,
        )
        invite_link = WorkspaceInviteLink.objects.create(
            workspace=workspace,
            role=15,
            is_active=True,
            created_by=create_user,
        )
        return workspace, invite_link

    def _signup_request(self, **post_data):
        request = RequestFactory().post(
            "/auth/sign-up/",
            data=post_data,
            HTTP_USER_AGENT="Mozilla/5.0 (test)",
        )
        request.session = {}
        return request

    @pytest.mark.django_db
    def test_signup_disabled_without_invite(self, invite_link_workspace):
        request = self._signup_request(
            email="newuser@plane.so",
            password="Str0ng!Passw0rd",
        )

        def config_side_effect(keys):
            values = []
            for item in keys:
                key = item["key"]
                if key == "ENABLE_SIGNUP":
                    values.append("0")
                elif key == "ENABLE_EMAIL_PASSWORD":
                    values.append("1")
                else:
                    values.append(item.get("default"))
            return values

        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="newuser@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            with pytest.raises(AuthenticationException) as exc:
                provider.authenticate()
            assert exc.value.error_code == 5015

    @pytest.mark.django_db
    def test_signup_allowed_with_invite_code(self, invite_link_workspace):
        workspace, invite_link = invite_link_workspace
        request = self._signup_request(
            email="linkuser@plane.so",
            password="Str0ng!Passw0rd",
            invite_code=invite_link.anchor,
            workspace_slug=workspace.slug,
        )

        def config_side_effect(keys):
            values = []
            for item in keys:
                key = item["key"]
                if key == "ENABLE_SIGNUP":
                    values.append("0")
                elif key == "ENABLE_EMAIL_PASSWORD":
                    values.append("1")
                else:
                    values.append(item.get("default"))
            return values

        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="linkuser@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            user = provider.authenticate()

        assert user.email == "linkuser@plane.so"
        assert User.objects.filter(email="linkuser@plane.so").exists()
        invite = WorkspaceMemberInvite.objects.get(email="linkuser@plane.so", workspace=workspace)
        assert invite.accepted is True
        assert invite.role == 15

    @pytest.mark.django_db
    def test_signup_allowed_via_session_invite(self, invite_link_workspace):
        workspace, invite_link = invite_link_workspace
        request = self._signup_request(
            email="oauthuser@plane.so",
            password="Str0ng!Passw0rd",
        )
        request.session["invite_code"] = invite_link.anchor
        request.session["workspace_slug"] = workspace.slug

        def config_side_effect(keys):
            values = []
            for item in keys:
                key = item["key"]
                if key == "ENABLE_SIGNUP":
                    values.append("0")
                elif key == "ENABLE_EMAIL_PASSWORD":
                    values.append("1")
                else:
                    values.append(item.get("default"))
            return values

        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="oauthuser@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            user = provider.authenticate()

        assert user.email == "oauthuser@plane.so"
        assert WorkspaceMemberInvite.objects.filter(
            email="oauthuser@plane.so",
            workspace=workspace,
            accepted=True,
        ).exists()
