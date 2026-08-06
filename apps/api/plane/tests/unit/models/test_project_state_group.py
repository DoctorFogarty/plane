# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from uuid import uuid4

from plane.db.models import (
    Workspace,
    Project,
    ProjectStateGroup,
    State,
    StateGroup,
    seed_project_state_groups,
    REQUIRED_STATE_GROUP_CATEGORIES,
)


@pytest.mark.unit
class TestProjectStateGroupModel:
    @pytest.mark.django_db
    def test_seed_project_state_groups(self, create_user):
        workspace = Workspace.objects.create(
            name="Test Workspace", slug="test-psg", id=uuid4(), owner=create_user
        )
        project = Project.objects.create(
            name="Test Project",
            identifier="TPG",
            workspace=workspace,
        )

        category_map = seed_project_state_groups(project, created_by=create_user)

        assert set(category_map.keys()) == {
            StateGroup.BACKLOG.value,
            StateGroup.UNSTARTED.value,
            StateGroup.STARTED.value,
            StateGroup.COMPLETED.value,
            StateGroup.CANCELLED.value,
            StateGroup.TRIAGE.value,
        }
        assert ProjectStateGroup.all_objects.filter(project=project).count() == 6
        assert ProjectStateGroup.objects.filter(project=project).count() == 5
        assert category_map[StateGroup.TRIAGE.value].is_system is True

    @pytest.mark.django_db
    def test_state_syncs_category_from_workflow_group(self, create_user):
        workspace = Workspace.objects.create(
            name="Test Workspace", slug="test-psg-2", id=uuid4(), owner=create_user
        )
        project = Project.objects.create(
            name="Test Project",
            identifier="TPG2",
            workspace=workspace,
        )
        category_map = seed_project_state_groups(project, created_by=create_user)
        started_group = category_map[StateGroup.STARTED.value]

        state = State.objects.create(
            name="In Review",
            color="#F59E0B",
            project=project,
            workspace=workspace,
            workflow_group=started_group,
            group=StateGroup.BACKLOG.value,  # intentionally wrong; save should sync
        )

        state.refresh_from_db()
        assert state.group == StateGroup.STARTED.value
        assert state.workflow_group_id == started_group.id

    @pytest.mark.django_db
    def test_required_categories_constant(self):
        assert StateGroup.TRIAGE.value not in REQUIRED_STATE_GROUP_CATEGORIES
        assert len(REQUIRED_STATE_GROUP_CATEGORIES) == 5
