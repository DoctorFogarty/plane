# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import status

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Intake,
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyType,
    IssueType,
    IssueView,
    Label,
    Project,
    ProjectIdentifier,
    ProjectIssueType,
    ProjectMember,
    ProjectStateGroup,
    State,
    User,
    WorkspaceMember,
    seed_project_state_groups,
)
from plane.db.models.state import DEFAULT_STATES


@pytest.mark.contract
class TestProjectDuplicateAPI:
    def _duplicate_url(self, workspace_slug: str, project_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/duplicate/"

    def _seed_source_project(self, workspace, user):
        project = Project.objects.create(
            name="Source Project",
            identifier="SRC",
            workspace=workspace,
            cycle_view=True,
            module_view=True,
            issue_views_view=True,
            intake_view=True,
            is_issue_type_enabled=True,
            created_by=user,
        )
        ProjectIdentifier.objects.create(name=project.identifier, project=project, workspace=workspace)
        ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)

        category_to_group = seed_project_state_groups(project, created_by=user)
        State.objects.bulk_create(
            [
                State(
                    name=state["name"],
                    color=state["color"],
                    project=project,
                    sequence=state["sequence"],
                    workspace=workspace,
                    group=state["group"],
                    workflow_group=category_to_group.get(state["group"]),
                    default=state.get("default", False),
                    created_by=user,
                )
                for state in DEFAULT_STATES
                if state["group"] != "triage"
            ]
        )
        # Mark first unstarted as default
        default_state = State.objects.filter(project=project, name="Todo").first()
        if default_state:
            default_state.default = True
            default_state.save(update_fields=["default"])
            project.default_state = default_state
            project.save(update_fields=["default_state"])

        Label.objects.create(name="Bug", color="#ff0000", project=project, workspace=workspace, created_by=user)
        parent = Label.objects.create(
            name="Parent", color="#00ff00", project=project, workspace=workspace, created_by=user
        )
        Label.objects.create(
            name="Child",
            color="#0000ff",
            parent=parent,
            project=project,
            workspace=workspace,
            created_by=user,
        )

        estimate = Estimate.objects.create(
            name="Points",
            type="points",
            project=project,
            workspace=workspace,
            created_by=user,
        )
        EstimatePoint.objects.create(
            estimate=estimate,
            key=1,
            value="1",
            project=project,
            workspace=workspace,
            created_by=user,
        )
        project.estimate = estimate
        project.save(update_fields=["estimate"])

        issue_type = IssueType.objects.create(
            name="Task",
            workspace=workspace,
            is_default=True,
            created_by=user,
        )
        ProjectIssueType.objects.create(
            project=project,
            issue_type=issue_type,
            is_default=True,
            level=0,
            created_by=user,
        )
        prop = IssueProperty.objects.create(
            name="Severity",
            property_type=IssuePropertyType.DROPDOWN,
            issue_type=issue_type,
            project=project,
            workspace=workspace,
            created_by=user,
        )
        option = IssuePropertyOption.objects.create(
            name="Critical",
            property=prop,
            project=project,
            workspace=workspace,
            is_default=True,
            created_by=user,
        )

        IssueView.objects.create(
            name="Critical bugs",
            project=project,
            workspace=workspace,
            owned_by=user,
            filters={
                "state": [str(default_state.id)] if default_state else [],
                "labels": [str(parent.id)],
                f"customproperty_{prop.id}__in": [str(option.id)],
                "cycle": [str(uuid.uuid4())],
            },
            rich_filters={
                "state_id__in": [str(default_state.id)] if default_state else [],
                "module_id__in": [str(uuid.uuid4())],
            },
            created_by=user,
        )

        Intake.objects.create(
            name=f"{project.name} Intake",
            project=project,
            workspace=workspace,
            is_default=True,
            created_by=user,
        )

        # Content that must NOT be copied
        Issue.objects.create(
            name="Should not copy",
            project=project,
            workspace=workspace,
            state=default_state,
            created_by=user,
        )

        return project, prop, option, default_state, parent

    @pytest.mark.django_db
    def test_duplicate_project_setup_only(self, session_client, workspace, create_user):
        source, prop, option, default_state, parent_label = self._seed_source_project(workspace, create_user)

        response = session_client.post(
            self._duplicate_url(workspace.slug, source.id),
            {"name": "Duplicated Project", "identifier": "DUP"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "Duplicated Project"
        assert data["identifier"] == "DUP"
        assert data["id"] != str(source.id)
        assert data["cycle_view"] is True
        assert data["module_view"] is True
        assert data["intake_view"] is True
        assert data["is_issue_type_enabled"] is True

        new_project = Project.objects.get(id=data["id"])
        assert new_project.workspace_id == workspace.id
        assert ProjectIdentifier.objects.filter(project=new_project, name="DUP").exists()

        # States copied (not default seed-only)
        assert State.objects.filter(project=new_project).count() == State.objects.filter(project=source).count()
        assert ProjectStateGroup.all_objects.filter(project=new_project).count() == ProjectStateGroup.all_objects.filter(
            project=source
        ).count()

        # Labels + parent remap
        assert Label.objects.filter(project=new_project).count() == 3
        child = Label.objects.get(project=new_project, name="Child")
        assert child.parent is not None
        assert child.parent.name == "Parent"
        assert child.parent_id != parent_label.id

        # Estimates
        assert Estimate.objects.filter(project=new_project).count() == 1
        assert EstimatePoint.objects.filter(project=new_project).count() == 1
        assert new_project.estimate_id is not None
        assert new_project.estimate_id != source.estimate_id

        # Issue types linked (same workspace type)
        assert ProjectIssueType.objects.filter(project=new_project).count() == 1
        new_prop = IssueProperty.objects.get(project=new_project, name="Severity")
        assert new_prop.id != prop.id
        new_option = IssuePropertyOption.objects.get(project=new_project, name="Critical")
        assert new_option.id != option.id
        assert new_option.property_id == new_prop.id

        # Views remapped
        view = IssueView.objects.get(project=new_project, name="Critical bugs")
        assert "cycle" not in (view.filters or {})
        assert "module_id__in" not in (view.rich_filters or {})
        assert f"customproperty_{new_prop.id}__in" in (view.filters or {})
        assert view.filters[f"customproperty_{new_prop.id}__in"] == [str(new_option.id)]

        # Intake shell only
        assert Intake.objects.filter(project=new_project).count() == 1
        assert Issue.objects.filter(project=new_project).count() == 0

        # Members
        assert ProjectMember.objects.filter(project=new_project, member=create_user, role=20, is_active=True).exists()

    @pytest.mark.django_db
    def test_duplicate_project_requires_admin(self, session_client, workspace, create_user):
        source, *_ = self._seed_source_project(workspace, create_user)
        member = User.objects.create_user(email="member@example.com", username="member")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        ProjectMember.objects.filter(project=source, member=create_user).update(role=15)
        ProjectMember.objects.create(project=source, member=member, role=15, is_active=True)

        session_client.force_authenticate(user=member)
        response = session_client.post(
            self._duplicate_url(workspace.slug, source.id),
            {"name": "No Access", "identifier": "NOA"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_duplicate_project_duplicate_identifier(self, session_client, workspace, create_user):
        source, *_ = self._seed_source_project(workspace, create_user)
        response = session_client.post(
            self._duplicate_url(workspace.slug, source.id),
            {"name": "Another Name", "identifier": "SRC"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
