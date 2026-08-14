# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
import pytz

from plane.utils.timezone_converter import (
    DEFAULT_USER_TIMEZONE,
    resolve_signup_timezone,
    sanitize_user_timezone,
)


@pytest.mark.unit
class TestSanitizeUserTimezone:
    def test_keeps_common_iana_zone(self):
        assert sanitize_user_timezone("America/Chicago") == "America/Chicago"

    def test_strips_whitespace(self):
        assert sanitize_user_timezone("  Europe/London  ") == "Europe/London"

    def test_missing_and_invalid_fall_back_to_utc(self):
        assert sanitize_user_timezone(None) == DEFAULT_USER_TIMEZONE
        assert sanitize_user_timezone("") == DEFAULT_USER_TIMEZONE
        assert sanitize_user_timezone("   ") == DEFAULT_USER_TIMEZONE
        assert sanitize_user_timezone(123) == DEFAULT_USER_TIMEZONE
        assert sanitize_user_timezone("not-a-timezone") == DEFAULT_USER_TIMEZONE
        assert sanitize_user_timezone("a" * 256) == DEFAULT_USER_TIMEZONE

    def test_resolves_known_alias_when_possible(self):
        try:
            pytz.timezone("Asia/Calcutta")
        except pytz.UnknownTimeZoneError:
            pytest.skip("pytz does not know Asia/Calcutta")
        result = sanitize_user_timezone("Asia/Calcutta")
        assert result in pytz.all_timezones_set
        assert result != DEFAULT_USER_TIMEZONE


@pytest.mark.unit
class TestResolveSignupTimezone:
    def test_prefers_post_over_get_and_session(self, rf):
        request = rf.post("/auth/sign-up/", data={"user_timezone": "America/Chicago"})
        request.GET = request.GET.copy()
        request.GET["user_timezone"] = "Europe/London"
        request.session = {"user_timezone": "Asia/Tokyo"}
        assert resolve_signup_timezone(request) == "America/Chicago"

    def test_reads_session_when_body_is_empty(self, rf):
        request = rf.get("/auth/google/")
        request.session = {"user_timezone": "America/New_York"}
        assert resolve_signup_timezone(request) == "America/New_York"

    def test_none_request_is_utc(self):
        assert resolve_signup_timezone(None) == DEFAULT_USER_TIMEZONE
