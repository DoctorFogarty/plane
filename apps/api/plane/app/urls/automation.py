# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import AutomationRunViewSet, AutomationViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/",
        AutomationViewSet.as_view({"get": "list", "post": "create"}),
        name="project-automations",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:pk>/",
        AutomationViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-automation-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:automation_id>/runs/",
        AutomationRunViewSet.as_view({"get": "list"}),
        name="project-automation-runs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/automations/<uuid:automation_id>/runs/<uuid:pk>/",
        AutomationRunViewSet.as_view({"get": "retrieve"}),
        name="project-automation-run-detail",
    ),
]
