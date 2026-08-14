# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.bgtasks.email_notification_task import partition_email_changes


@pytest.mark.unit
class TestPartitionEmailChanges:
    def test_splits_builtin_and_custom_fields(self):
        changes = {
            "priority": {"old_value": ["low"], "new_value": ["high"]},
            "Severity": {"old_value": ["Minor"], "new_value": ["Critical"]},
            "Customer": {"new_value": ["Acme"]},
        }

        builtin, custom = partition_email_changes(changes)

        assert builtin == {"priority": {"old_value": ["low"], "new_value": ["high"]}}
        assert custom == [
            {"name": "Severity", "old_value": ["Minor"], "new_value": ["Critical"]},
            {"name": "Customer", "old_value": None, "new_value": ["Acme"]},
        ]

    def test_all_builtin_fields_stay_in_changes(self):
        changes = {
            "name": {"new_value": ["Title"]},
            "target_date": {"new_value": ["2026-01-01"]},
            "assignees": {"new_value": ["Jane"]},
            "labels": {"old_value": ["bug"]},
            "state": {"new_value": ["Done"]},
            "link": {"new_value": ["https://example.com"]},
            "duplicate": {"new_value": ["TP-1"]},
            "blocking": {"new_value": ["TP-2"]},
            "priority": {"new_value": ["urgent"]},
        }

        builtin, custom = partition_email_changes(changes)

        assert set(builtin.keys()) == set(changes.keys())
        assert custom == []

    def test_cleared_custom_property_keeps_old_value_only(self):
        changes = {"Region": {"old_value": ["EMEA"]}}

        builtin, custom = partition_email_changes(changes)

        assert builtin == {}
        assert custom == [{"name": "Region", "old_value": ["EMEA"], "new_value": None}]
