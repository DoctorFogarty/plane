# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import DraftIssue


@pytest.mark.unit
class TestDraftIssuePropertyValues:
    def test_draft_issue_has_property_values_field(self):
        field = DraftIssue._meta.get_field("property_values")
        assert field is not None
        assert field.get_default() == {} or field.default == dict
