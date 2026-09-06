# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from pathlib import Path

import pytest

from plane.utils.password import PASSWORD_MIN_ZXCVBN_SCORE, assess_password, weak_password_payload

FIXTURES_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "password_assessment.json"


@pytest.mark.unit
class TestPasswordAssessment:
    def test_threshold_matches_frontend_contract(self):
        assert PASSWORD_MIN_ZXCVBN_SCORE == 3

    def test_common_composition_passwords_are_rejected(self):
        for password in ("Password1!", "P@ssw0rd"):
            assessment = assess_password(password)
            assert assessment["acceptable"] is False
            assert assessment["score"] < PASSWORD_MIN_ZXCVBN_SCORE
            payload = weak_password_payload(assessment)
            assert "password_warning" in payload
            assert "password_suggestion" in payload

    def test_long_passphrase_is_accepted(self):
        assessment = assess_password("correct horse battery staple extra")
        assert assessment["acceptable"] is True
        assert assessment["score"] >= PASSWORD_MIN_ZXCVBN_SCORE

    def test_fixture_scores_stay_in_expected_bands(self):
        fixtures = json.loads(FIXTURES_PATH.read_text())
        for case in fixtures:
            assessment = assess_password(case["password"])
            assert assessment["acceptable"] is case["acceptable"]
            if "maxScore" in case:
                assert assessment["score"] <= case["maxScore"]
            if "minScore" in case:
                assert assessment["score"] >= case["minScore"]
