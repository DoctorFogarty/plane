# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models.workspace import WorkspaceUserProperties


@pytest.mark.unit
class TestWorkspaceUserProperties:
    @pytest.mark.django_db
    def test_navigation_control_preference_defaults_to_tabbed(self, create_user, workspace):
        properties = WorkspaceUserProperties.objects.create(user=create_user, workspace=workspace)

        assert properties.navigation_control_preference == WorkspaceUserProperties.NavigationControlPreference.TABBED
