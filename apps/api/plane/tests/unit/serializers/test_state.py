# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.app.serializers import StateSerializer
from plane.db.models import Project, State, seed_project_state_groups
from plane.db.models.state import StateGroup


@pytest.mark.unit
class TestStateSerializer:
    @pytest.mark.django_db
    def test_update_group_without_group_id_assigns_category_group(self, db, workspace, create_user):
        project = Project.objects.create(name="States", identifier="STS", workspace=workspace)
        category_map = seed_project_state_groups(project, created_by=create_user)
        started = category_map[StateGroup.STARTED.value]
        completed = category_map[StateGroup.COMPLETED.value]

        state = State.objects.create(
            name="In Progress",
            color="#f59e0b",
            project=project,
            workspace=workspace,
            workflow_group=started,
            group=StateGroup.STARTED.value,
        )

        serializer = StateSerializer(
            state,
            data={"group": StateGroup.COMPLETED.value},
            partial=True,
            context={"project_id": project.id},
        )
        assert serializer.is_valid(), serializer.errors
        serializer.save()

        state.refresh_from_db()
        assert state.group == StateGroup.COMPLETED.value
        assert state.workflow_group_id == completed.id
