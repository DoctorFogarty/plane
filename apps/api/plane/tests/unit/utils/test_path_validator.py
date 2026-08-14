# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.path_validator import get_safe_redirect_url, validate_next_path


@pytest.mark.unit
class TestValidateNextPath:
    def test_preserves_workspace_join_query(self):
        path = "/workspace-join/?slug=code-orange&code=abc123"
        assert validate_next_path(path) == path

    def test_strips_absolute_url_but_keeps_query(self):
        assert (
            validate_next_path("https://evil.example/workspace-join/?slug=x&code=y")
            == "/workspace-join/?slug=x&code=y"
        )

    def test_rejects_traversal(self):
        assert validate_next_path("/workspace-join/../admin") == ""


@pytest.mark.unit
class TestGetSafeRedirectUrl:
    def test_encodes_next_path_query(self):
        url = get_safe_redirect_url(
            base_url="http://localhost:8000",
            next_path="/workspace-join/?slug=code-orange&code=abc123",
            params={"error_code": "5015"},
        )
        assert "next_path=%2Fworkspace-join%2F%3Fslug%3Dcode-orange%26code%3Dabc123" in url
        assert "error_code=5015" in url
        # Raw unencoded `?slug=` must not appear as a top-level separator after next_path=
        assert "next_path=/workspace-join/?slug=" not in url
