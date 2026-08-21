# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models.project import get_default_preferences


@pytest.mark.unit
def test_default_navigation_tab_is_list():
    preferences = get_default_preferences()
    assert preferences["navigation"]["default_tab"] == "list"
    assert preferences["navigation"]["hide_in_more_menu"] == []
