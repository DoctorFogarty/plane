# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models.workspace import WorkspaceUserProperties


@pytest.mark.contract
class TestWorkspaceUserProperties:
    @pytest.mark.django_db
    def test_get_defaults_to_tabbed_navigation(self, session_client, workspace):
        url = reverse("workspace-user-filters", kwargs={"slug": workspace.slug})
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["navigation_control_preference"] == "TABBED"

    @pytest.mark.django_db
    def test_patch_can_switch_to_accordion_navigation(self, session_client, workspace):
        url = reverse("workspace-user-filters", kwargs={"slug": workspace.slug})
        response = session_client.patch(url, {"navigation_control_preference": "ACCORDION"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["navigation_control_preference"] == "ACCORDION"

        properties = WorkspaceUserProperties.objects.get(workspace=workspace)
        assert properties.navigation_control_preference == "ACCORDION"
