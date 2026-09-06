# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from zxcvbn import zxcvbn

# Keep in sync with packages/constants/src/auth/index.ts
PASSWORD_MIN_ZXCVBN_SCORE = 3


def assess_password(password: str) -> dict:
    """Score a password with zxcvbn. The API accepts score >= 3 only."""
    results = zxcvbn(password or "")
    feedback = results.get("feedback") or {}
    warning = feedback.get("warning") or ""
    suggestions = feedback.get("suggestions") or []
    score = int(results.get("score") or 0)
    return {
        "score": score,
        "acceptable": score >= PASSWORD_MIN_ZXCVBN_SCORE,
        "warning": warning,
        "suggestions": suggestions,
    }


def weak_password_payload(assessment: dict, extra: dict | None = None) -> dict:
    suggestions = assessment.get("suggestions") or []
    payload = {
        "password_warning": assessment.get("warning") or "",
        "password_suggestion": suggestions[0] if suggestions else "",
    }
    if extra:
        payload.update(extra)
    return payload
