# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import hashlib
import hmac


def verify_github_webhook_signature(payload: bytes, signature_header: str | None, secret: str) -> bool:
    """Verify X-Hub-Signature-256 from GitHub webhooks."""
    if not secret or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
