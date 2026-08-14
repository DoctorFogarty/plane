# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProperty,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.db.models.issue_property import IssuePropertyType


@pytest.fixture
def property_notification_context(db, create_user):
    workspace = Workspace.objects.create(name="Prop Notif WS", slug="prop-notif-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Prop Notif Project",
        identifier="PNP",
        workspace=workspace,
        created_by=create_user,
        is_issue_type_enabled=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    state = State.objects.create(
        name="Todo",
        project=project,
        workspace=workspace,
        group="backlog",
        default=True,
    )
    issue_type = IssueType.objects.create(
        workspace=workspace,
        name="Task",
        is_epic=False,
        is_default=True,
        is_active=True,
    )
    ProjectIssueType.objects.create(
        project=project,
        issue_type=issue_type,
        workspace=workspace,
        is_default=True,
        level=0,
    )
    property_obj = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="Severity",
        property_type=IssuePropertyType.TEXT,
        is_active=True,
        created_by=create_user,
    )
    issue = Issue.objects.create(
        name="Work item with properties",
        project=project,
        workspace=workspace,
        state=state,
        type=issue_type,
        created_by=create_user,
    )
    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "issue": issue,
        "property": property_obj,
    }


@pytest.mark.unit
@pytest.mark.django_db
class TestIssuePropertyValueNotifications:
    def _url(self, workspace_slug, project_id, issue_id):
        return (
            f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/property-values/"
        )

    def test_property_change_dispatches_notifications(self, session_client, property_notification_context):
        ctx = property_notification_context
        url = self._url(ctx["workspace"].slug, ctx["project"].id, ctx["issue"].id)
        prop_id = str(ctx["property"].id)

        mock_redis = MagicMock()
        with (
            patch("plane.app.views.issue.type.notifications") as mock_notifications,
            patch("plane.app.views.issue.type.redis_instance", return_value=mock_redis),
            patch(
                "plane.app.views.issue.type.base_host",
                return_value="https://app.example.com",
            ),
        ):
            response = session_client.patch(
                url,
                {"property_values": {prop_id: "Critical"}},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        mock_redis.set.assert_called_once_with(str(ctx["issue"].id), "https://app.example.com", ex=600)
        mock_notifications.delay.assert_called_once()
        kwargs = mock_notifications.delay.call_args.kwargs
        assert kwargs["type"] == "issue_property.activity.updated"
        assert str(kwargs["issue_id"]) == str(ctx["issue"].id)
        assert str(kwargs["actor_id"]) == str(ctx["user"].id)
        assert str(kwargs["project_id"]) == str(ctx["project"].id)
        assert kwargs["subscriber"] is True

        activities = json.loads(kwargs["issue_activities_created"])
        assert len(activities) == 1
        assert activities[0]["field"] == "Severity"
        assert activities[0]["new_value"] == "Critical"
        assert IssueActivity.objects.filter(issue_id=ctx["issue"].id, field="Severity").exists()

    def test_clearing_property_dispatches_notifications(self, session_client, property_notification_context):
        ctx = property_notification_context
        url = self._url(ctx["workspace"].slug, ctx["project"].id, ctx["issue"].id)
        prop_id = str(ctx["property"].id)

        mock_redis = MagicMock()
        with (
            patch("plane.app.views.issue.type.notifications"),
            patch("plane.app.views.issue.type.redis_instance", return_value=mock_redis),
            patch(
                "plane.app.views.issue.type.base_host",
                return_value="https://app.example.com",
            ),
        ):
            setup_response = session_client.patch(
                url,
                {"property_values": {prop_id: "Critical"}},
                format="json",
            )
        assert setup_response.status_code == status.HTTP_200_OK

        with (
            patch("plane.app.views.issue.type.notifications") as mock_notifications,
            patch("plane.app.views.issue.type.redis_instance", return_value=mock_redis),
            patch(
                "plane.app.views.issue.type.base_host",
                return_value="https://app.example.com",
            ),
        ):
            response = session_client.patch(
                url,
                {"property_values": {prop_id: ""}},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        mock_notifications.delay.assert_called_once()
        activities = json.loads(mock_notifications.delay.call_args.kwargs["issue_activities_created"])
        assert activities[0]["field"] == "Severity"
        assert activities[0]["old_value"] == "Critical"

    def test_noop_property_upsert_does_not_notify(self, session_client, property_notification_context):
        ctx = property_notification_context
        url = self._url(ctx["workspace"].slug, ctx["project"].id, ctx["issue"].id)
        prop_id = str(ctx["property"].id)

        mock_redis = MagicMock()
        with (
            patch("plane.app.views.issue.type.notifications"),
            patch("plane.app.views.issue.type.redis_instance", return_value=mock_redis),
            patch(
                "plane.app.views.issue.type.base_host",
                return_value="https://app.example.com",
            ),
        ):
            setup_response = session_client.patch(
                url,
                {"property_values": {prop_id: "Critical"}},
                format="json",
            )
        assert setup_response.status_code == status.HTTP_200_OK

        with patch("plane.app.views.issue.type.notifications") as mock_notifications:
            response = session_client.patch(
                url,
                {"property_values": {prop_id: "Critical"}},
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        mock_notifications.delay.assert_not_called()
