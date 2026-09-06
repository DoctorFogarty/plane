# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone

from plane.db.models import DraftIssue, Issue, Project, State, Workspace
from plane.db.models.state import StateGroup
from plane.utils.state import (
    StateDeleteError,
    delete_project_state,
    fallback_state_id_from_request,
)


@pytest.fixture
def state_workspace(create_user):
    return Workspace.objects.create(name="State WS", slug="state-ws", owner=create_user)


@pytest.fixture
def state_project(state_workspace, create_user):
    return Project.objects.create(
        name="State Project",
        identifier="STP",
        workspace=state_workspace,
        created_by=create_user,
    )


def _create_state(project, name, group, default=False):
    return State.objects.create(
        name=name,
        color="#60646C",
        project=project,
        workspace=project.workspace,
        group=group,
        default=default,
    )


@pytest.mark.unit
class TestFallbackStateIdFromRequest:
    def test_reads_query_param_first(self):
        request = SimpleNamespace(
            query_params={"fallback_state_id": "from-query"},
            data={"fallback_state_id": "from-body"},
        )
        assert fallback_state_id_from_request(request) == "from-query"

    def test_falls_back_to_body(self):
        request = SimpleNamespace(query_params={}, data={"fallback_state_id": "from-body"})
        assert fallback_state_id_from_request(request) == "from-body"

    def test_empty_values_are_none(self):
        request = SimpleNamespace(query_params={}, data={})
        assert fallback_state_id_from_request(request) is None


@pytest.mark.unit
class TestDeleteProjectState:
    @pytest.mark.django_db
    def test_deletes_empty_state(self, state_project):
        source = _create_state(state_project, "Extra", StateGroup.STARTED.value)
        fallback = _create_state(state_project, "Keep", StateGroup.STARTED.value)

        delete_project_state(
            slug=state_project.workspace.slug,
            project_id=state_project.id,
            state_id=source.id,
        )

        assert State.objects.filter(pk=source.id).exists() is False
        assert State.objects.filter(pk=fallback.id).exists() is True

    @pytest.mark.django_db
    def test_rejects_default_state(self, state_project):
        source = _create_state(state_project, "Todo", StateGroup.UNSTARTED.value, default=True)
        fallback = _create_state(state_project, "Keep", StateGroup.UNSTARTED.value)

        with pytest.raises(StateDeleteError, match="Default state cannot be deleted"):
            delete_project_state(
                slug=state_project.workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
                fallback_state_id=fallback.id,
            )

        assert State.objects.filter(pk=source.id).exists() is True

    @pytest.mark.django_db
    def test_occupied_without_fallback_is_rejected(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )

        with pytest.raises(StateDeleteError, match="The state is not empty"):
            delete_project_state(
                slug=state_project.workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
            )

        assert State.objects.filter(pk=source.id).exists() is True

    @pytest.mark.django_db
    def test_moves_issues_and_drafts_then_deletes(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        fallback = _create_state(state_project, "Todo", StateGroup.UNSTARTED.value)
        issue = Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )
        archived = Issue.objects.create(
            name="Archived work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
            archived_at=timezone.now().date(),
        )
        draft = DraftIssue.objects.create(
            name="Draft work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
        )

        delete_project_state(
            slug=state_project.workspace.slug,
            project_id=state_project.id,
            state_id=source.id,
            fallback_state_id=fallback.id,
        )

        issue.refresh_from_db()
        archived.refresh_from_db()
        draft.refresh_from_db()
        assert issue.state_id == fallback.id
        assert archived.state_id == fallback.id
        assert draft.state_id == fallback.id
        assert State.objects.filter(pk=source.id).exists() is False

    @pytest.mark.django_db
    def test_sets_completed_at_when_moving_into_completed(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        fallback = _create_state(state_project, "Done", StateGroup.COMPLETED.value)
        issue = Issue.objects.create(
            name="Almost done",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )
        assert issue.completed_at is None

        delete_project_state(
            slug=state_project.workspace.slug,
            project_id=state_project.id,
            state_id=source.id,
            fallback_state_id=fallback.id,
        )

        issue.refresh_from_db()
        assert issue.state_id == fallback.id
        assert issue.completed_at is not None

    @pytest.mark.django_db
    def test_clears_completed_at_when_leaving_completed(self, state_project, create_user):
        source = _create_state(state_project, "Done", StateGroup.COMPLETED.value)
        fallback = _create_state(state_project, "Todo", StateGroup.UNSTARTED.value)
        issue = Issue.objects.create(
            name="Reopened",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )
        assert issue.completed_at is not None

        delete_project_state(
            slug=state_project.workspace.slug,
            project_id=state_project.id,
            state_id=source.id,
            fallback_state_id=fallback.id,
        )

        issue.refresh_from_db()
        assert issue.state_id == fallback.id
        assert issue.completed_at is None

    @pytest.mark.django_db
    def test_rejects_self_fallback(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )

        with pytest.raises(StateDeleteError, match="Fallback state must be different"):
            delete_project_state(
                slug=state_project.workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
                fallback_state_id=source.id,
            )

    @pytest.mark.django_db
    def test_rejects_invalid_fallback(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )

        with pytest.raises(StateDeleteError, match="Fallback state is invalid"):
            delete_project_state(
                slug=state_project.workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
                fallback_state_id=uuid4(),
            )

    @pytest.mark.django_db
    def test_rejects_cross_project_fallback(self, state_workspace, state_project, create_user):
        other_project = Project.objects.create(
            name="Other",
            identifier="OTH",
            workspace=state_workspace,
            created_by=create_user,
        )
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        other_state = _create_state(other_project, "Other Todo", StateGroup.UNSTARTED.value)
        Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_workspace,
            state=source,
            created_by=create_user,
        )

        with pytest.raises(StateDeleteError, match="Fallback state is invalid"):
            delete_project_state(
                slug=state_workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
                fallback_state_id=other_state.id,
            )

    @pytest.mark.django_db
    def test_rejects_malformed_fallback_id(self, state_project, create_user):
        source = _create_state(state_project, "In Progress", StateGroup.STARTED.value)
        Issue.objects.create(
            name="Open work",
            project=state_project,
            workspace=state_project.workspace,
            state=source,
            created_by=create_user,
        )

        with pytest.raises(StateDeleteError, match="Invalid fallback_state_id"):
            delete_project_state(
                slug=state_project.workspace.slug,
                project_id=state_project.id,
                state_id=source.id,
                fallback_state_id="not-a-uuid",
            )
