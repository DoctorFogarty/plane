# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    StateListCreateAPIEndpoint,
    StateDetailAPIEndpoint,
)
from plane.api.views.state_group import (
    StateGroupListCreateAPIEndpoint,
    StateGroupDetailAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/states/",
        StateListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="states",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:state_id>/",
        StateDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="states",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/state-groups/",
        StateGroupListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="state-groups",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/state-groups/<uuid:group_id>/",
        StateGroupDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="state-groups",
    ),
]
