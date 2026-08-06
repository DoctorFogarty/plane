# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssuePropertyOptionViewSet,
    IssuePropertyValueEndpoint,
    IssuePropertyViewSet,
    IssueTypeEnableEndpoint,
    IssueTypePropertiesAndOptionsEndpoint,
    IssueTypeViewSet,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/enable/",
        IssueTypeEnableEndpoint.as_view(),
        name="project-issue-types-enable",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types-properties-and-options/",
        IssueTypePropertiesAndOptionsEndpoint.as_view(),
        name="project-work-item-types-properties-and-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/",
        IssuePropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-type-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:pk>/",
        IssuePropertyViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type-property",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/",
        IssuePropertyOptionViewSet.as_view({"post": "create"}),
        name="project-issue-type-property-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:type_id>/properties/<uuid:property_id>/options/<uuid:pk>/",
        IssuePropertyOptionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-type-property-option",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/",
        IssuePropertyValueEndpoint.as_view(),
        name="project-issue-property-values",
    ),
]
