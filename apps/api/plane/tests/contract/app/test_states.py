# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State
from plane.db.models.state import StateGroup


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="States Project",
        identifier="STS",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=20,
        is_active=True,
    )
    return project


def _create_state(project, name, group, default=False):
    return State.objects.create(
        name=name,
        color="#60646C",
        project=project,
        workspace=project.workspace,
        group=group,
        default=default,
    )


def _state_url(workspace_slug, project_id, state_id):
    return f"/api/workspaces/{workspace_slug}/projects/{project_id}/states/{state_id}/"


@pytest.mark.contract
class TestStateDeleteAPI:
    @pytest.mark.django_db
    def test_delete_empty_state(self, session_client, workspace, project):
        source = _create_state(project, "Extra", StateGroup.STARTED.value)
        _create_state(project, "Keep", StateGroup.STARTED.value)

        response = session_client.delete(_state_url(workspace.slug, project.id, source.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert State.objects.filter(pk=source.id).exists() is False

    @pytest.mark.django_db
    def test_delete_default_state_rejected(self, session_client, workspace, project):
        source = _create_state(project, "Todo", StateGroup.UNSTARTED.value, default=True)

        response = session_client.delete(_state_url(workspace.slug, project.id, source.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Default state cannot be deleted"
        assert State.objects.filter(pk=source.id).exists() is True

    @pytest.mark.django_db
    def test_delete_occupied_state_without_fallback(self, session_client, workspace, project, create_user):
        source = _create_state(project, "In Progress", StateGroup.STARTED.value)
        Issue.objects.create(
            name="Blocked delete",
            project=project,
            workspace=workspace,
            state=source,
            created_by=create_user,
        )

        response = session_client.delete(_state_url(workspace.slug, project.id, source.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not empty" in response.data["error"]

    @pytest.mark.django_db
    def test_delete_occupied_state_with_fallback(self, session_client, workspace, project, create_user):
        source = _create_state(project, "In Progress", StateGroup.STARTED.value)
        fallback = _create_state(project, "Todo", StateGroup.UNSTARTED.value)
        issue = Issue.objects.create(
            name="Needs a new home",
            project=project,
            workspace=workspace,
            state=source,
            created_by=create_user,
        )

        response = session_client.delete(
            f"{_state_url(workspace.slug, project.id, source.id)}?fallback_state_id={fallback.id}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.state_id == fallback.id
        assert State.objects.filter(pk=source.id).exists() is False

    @pytest.mark.django_db
    def test_delete_rejects_cross_project_fallback(self, session_client, workspace, project, create_user):
        other_project = Project.objects.create(
            name="Other Project",
            identifier="OTP",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=other_project, member=create_user, role=20, is_active=True)
        source = _create_state(project, "In Progress", StateGroup.STARTED.value)
        other_state = _create_state(other_project, "Other Todo", StateGroup.UNSTARTED.value)
        Issue.objects.create(
            name="Blocked delete",
            project=project,
            workspace=workspace,
            state=source,
            created_by=create_user,
        )

        response = session_client.delete(
            f"{_state_url(workspace.slug, project.id, source.id)}?fallback_state_id={other_state.id}"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Fallback state is invalid"
        assert State.objects.filter(pk=source.id).exists() is True
