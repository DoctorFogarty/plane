# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from django.core.signing import BadSignature, TimestampSigner

_SIGNER = TimestampSigner(salt="plane-slack-oauth")


def sign_oauth_state(payload: dict) -> str:
    import json

    return _SIGNER.sign(json.dumps(payload, separators=(",", ":")))


def unsign_oauth_state(state: str, max_age: int = 600) -> dict | None:
    import json

    try:
        raw = _SIGNER.unsign(state, max_age=max_age)
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return data
    except (BadSignature, ValueError, TypeError):
        return None
