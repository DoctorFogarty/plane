# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from django.test import RequestFactory

from plane.authentication.provider.credentials.email import EmailProvider
from plane.authentication.utils.invite_session import store_user_timezone_session
from plane.db.models import User


def _auth_config_side_effect(keys):
    values = []
    for item in keys:
        key = item["key"]
        if key == "ENABLE_SIGNUP":
            values.append("1")
        elif key == "ENABLE_EMAIL_PASSWORD":
            values.append("1")
        else:
            values.append(item.get("default"))
    return values


def _signup_request(**post_data):
    request = RequestFactory().post(
        "/auth/sign-up/",
        data=post_data,
        HTTP_USER_AGENT="Mozilla/5.0 (test)",
    )
    request.session = {}
    return request


@pytest.mark.unit
class TestStoreUserTimezoneSession:
    def test_stores_query_param_on_session(self):
        request = RequestFactory().get("/auth/google/", {"user_timezone": "America/Chicago"})
        request.session = {}
        store_user_timezone_session(request)
        assert request.session["user_timezone"] == "America/Chicago"

    def test_ignores_missing_param(self):
        request = RequestFactory().get("/auth/google/")
        request.session = {}
        store_user_timezone_session(request)
        assert "user_timezone" not in request.session


@pytest.mark.unit
class TestSignupTimezone:
    @pytest.mark.django_db
    def test_signup_persists_posted_timezone(self):
        request = _signup_request(
            email="tzuser@plane.so",
            password="Str0ng!Passw0rd",
            user_timezone="America/Chicago",
        )
        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="tzuser@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            user = provider.authenticate()

        assert user.user_timezone == "America/Chicago"
        assert User.objects.get(email="tzuser@plane.so").user_timezone == "America/Chicago"

    @pytest.mark.django_db
    def test_signup_invalid_timezone_falls_back_to_utc(self):
        request = _signup_request(
            email="badtz@plane.so",
            password="Str0ng!Passw0rd",
            user_timezone="not-a-timezone",
        )
        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="badtz@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            user = provider.authenticate()

        assert user.user_timezone == "UTC"

    @pytest.mark.django_db
    def test_signup_reads_timezone_from_session(self):
        request = _signup_request(
            email="sessiontz@plane.so",
            password="Str0ng!Passw0rd",
        )
        request.session["user_timezone"] = "Asia/Tokyo"
        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key="sessiontz@plane.so",
                code="Str0ng!Passw0rd",
                is_signup=True,
            )
            user = provider.authenticate()

        assert user.user_timezone == "Asia/Tokyo"

    @pytest.mark.django_db
    def test_login_does_not_overwrite_timezone(self, create_user, user_data):
        create_user.user_timezone = "America/New_York"
        create_user.save(update_fields=["user_timezone"])

        request = RequestFactory().post(
            "/auth/sign-in/",
            data={
                "email": user_data["email"],
                "password": user_data["password"],
                "user_timezone": "America/Chicago",
            },
            HTTP_USER_AGENT="Mozilla/5.0 (test)",
        )
        request.session = {}

        with patch(
            "plane.authentication.provider.credentials.email.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ), patch(
            "plane.authentication.adapter.base.get_configuration_value",
            side_effect=_auth_config_side_effect,
        ):
            provider = EmailProvider(
                request=request,
                key=user_data["email"],
                code=user_data["password"],
                is_signup=False,
            )
            user = provider.authenticate()

        assert user.user_timezone == "America/New_York"
        assert User.objects.get(email=user_data["email"]).user_timezone == "America/New_York"
