# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest

from plane.utils.project_duplicate import remap_filters, remap_rich_filters


@pytest.mark.unit
class TestProjectDuplicateFilterRemap:
    def test_remap_legacy_filters_states_labels_and_custom_properties(self):
        old_state = str(uuid4())
        new_state = str(uuid4())
        old_label = str(uuid4())
        new_label = str(uuid4())
        old_property = str(uuid4())
        new_property = str(uuid4())
        old_option = str(uuid4())
        new_option = str(uuid4())
        old_cycle = str(uuid4())

        remapped = remap_filters(
            {
                "state": [old_state],
                "labels": [old_label],
                "priority": ["urgent"],
                "cycle": [old_cycle],
                f"customproperty_{old_property}__in": [old_option],
            },
            state_map={old_state: new_state},
            label_map={old_label: new_label},
            property_map={old_property: new_property},
            option_map={old_option: new_option},
        )

        assert remapped["state"] == [new_state]
        assert remapped["labels"] == [new_label]
        assert remapped["priority"] == ["urgent"]
        assert "cycle" not in remapped
        assert remapped[f"customproperty_{new_property}__in"] == [new_option]

    def test_remap_rich_filters_nested_and_strips_modules(self):
        old_state = str(uuid4())
        new_state = str(uuid4())
        old_property = str(uuid4())
        new_property = str(uuid4())
        old_option = str(uuid4())
        new_option = str(uuid4())
        old_module = str(uuid4())

        remapped = remap_rich_filters(
            {
                "and": [
                    {"state_id__in": [old_state]},
                    {"module_id__in": [old_module]},
                    {f"customproperty_{old_property}__exact": old_option},
                    {"priority__in": ["high"]},
                ]
            },
            state_map={old_state: new_state},
            label_map={},
            property_map={old_property: new_property},
            option_map={old_option: new_option},
        )

        assert remapped["and"] == [
            {"state_id__in": [new_state]},
            {f"customproperty_{new_property}__exact": new_option},
            {"priority__in": ["high"]},
        ]

    def test_drops_unknown_custom_property_filters(self):
        missing_property = str(uuid4())
        remapped = remap_filters(
            {f"customproperty_{missing_property}__exact": "value"},
            state_map={},
            label_map={},
            property_map={},
            option_map={},
        )
        assert remapped == {}
