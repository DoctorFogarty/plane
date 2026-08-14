# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hmac
import hashlib

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from plane.utils.github import (
    build_branch_name,
    build_pull_request_body,
    build_pull_request_title,
    extract_work_item_identifier,
    normalize_github_app_name,
    normalize_private_key,
    parse_work_item_identifier,
    validate_private_key,
    verify_github_webhook_signature,
)


def _sample_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.mark.unit
class TestGithubIdentifier:
    def test_extract_from_branch_name(self):
        assert extract_work_item_identifier("PROJ-12-add-login") == "PROJ-12"
        assert extract_work_item_identifier("feature/proj-99-fix") == "PROJ-99"
        assert extract_work_item_identifier("no-identifier-here") is None

    def test_extract_from_pr_title(self):
        assert extract_work_item_identifier("Fix crash for ABC-7") == "ABC-7"

    def test_parse_identifier(self):
        assert parse_work_item_identifier("PROJ-123") == ("PROJ", 123)
        assert parse_work_item_identifier("proj-1") == ("PROJ", 1)
        assert parse_work_item_identifier("not-valid") is None

    def test_build_branch_name(self):
        name = build_branch_name("PROJ", 12, "Add Login Flow!")
        assert name.startswith("PROJ-12-")
        assert "add-login-flow" in name
        assert " " not in name

    def test_build_pull_request_title(self):
        assert build_pull_request_title("PROJ", 12, "Add login") == "PROJ-12 Add login"
        assert build_pull_request_title("proj", 12, "  ") == "PROJ-12"

    def test_build_pull_request_body(self):
        body = build_pull_request_body("PROJ", 12, "http://localhost:3000/ws/projects/p/issues/i")
        assert body.startswith("PROJ-12")
        assert "http://localhost:3000/ws/projects/p/issues/i" in body
        assert build_pull_request_body("PROJ", 12, "") == "PROJ-12"


@pytest.mark.unit
class TestGithubWebhookSignature:
    def test_valid_signature(self):
        secret = "test-secret"
        payload = b'{"action":"opened"}'
        digest = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        assert verify_github_webhook_signature(payload, f"sha256={digest}", secret) is True

    def test_invalid_signature(self):
        assert verify_github_webhook_signature(b"{}", "sha256=deadbeef", "secret") is False

    def test_missing_header(self):
        assert verify_github_webhook_signature(b"{}", None, "secret") is False


@pytest.mark.unit
class TestGithubConfigSanitization:
    def test_normalize_app_name_strips_extra_tokens(self):
        assert normalize_github_app_name("codeorangeapp d8c9d06d69e9f2ba") == "codeorangeapp"
        assert normalize_github_app_name("  my-app  ") == "my-app"
        assert normalize_github_app_name("") == ""

    def test_normalize_private_key_literal_newlines(self):
        raw = "-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----"
        normalized = normalize_private_key(raw)
        assert "\n" in normalized
        assert "\\n" not in normalized

    def test_validate_private_key_rejects_non_pem(self):
        with pytest.raises(ValueError, match="invalid"):
            validate_private_key("not-a-pem-key")

    def test_validate_private_key_allows_empty(self):
        assert validate_private_key("") == ""

    def test_validate_private_key_accepts_pem(self):
        pem = _sample_pem()
        assert "BEGIN" in validate_private_key(pem)
