# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import IssueProperty, IssueType, Label, Project, ProjectIssueType, Workspace, WorkspaceMember
from plane.db.models.issue_property import IssuePropertyType
from plane.utils.intake_form import validate_intake_form_fields, validate_issue_type_for_project


@pytest.fixture
def form_project(db, create_user):
    workspace = Workspace.objects.create(name="Form WS", slug="form-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Form Project",
        identifier="FRM",
        workspace=workspace,
        created_by=create_user,
        intake_view=True,
        is_issue_type_enabled=True,
    )
    issue_type = IssueType.objects.create(workspace=workspace, name="Task", is_default=True, is_active=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, workspace=workspace, is_default=True)
    text_property = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="Severity",
        property_type=IssuePropertyType.TEXT,
        is_active=True,
    )
    member_property = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="Reporter",
        property_type=IssuePropertyType.MEMBER,
        is_active=True,
    )
    label = Label.objects.create(workspace=workspace, project=project, name="Bug")
    return {
        "project": project,
        "issue_type": issue_type,
        "text_property": text_property,
        "member_property": member_property,
        "label": label,
    }


@pytest.mark.unit
class TestIntakeFormFieldValidation:
    def test_requires_name_field(self, form_project):
        project = form_project["project"]
        with pytest.raises(ValueError, match="name field is required"):
            validate_intake_form_fields(
                [{"key": "description", "source": "system", "required": False}],
                project_id=project.id,
                issue_type_id=form_project["issue_type"].id,
                types_enabled=True,
            )

    def test_rejects_member_property(self, form_project):
        project = form_project["project"]
        member_id = str(form_project["member_property"].id)
        with pytest.raises(ValueError, match="Member picker"):
            validate_intake_form_fields(
                [
                    {"key": "name", "source": "system", "required": True},
                    {"key": member_id, "source": "property", "property_id": member_id, "required": False},
                ],
                project_id=project.id,
                issue_type_id=form_project["issue_type"].id,
                types_enabled=True,
            )

    def test_accepts_text_property_and_labels(self, form_project):
        project = form_project["project"]
        property_id = str(form_project["text_property"].id)
        label_id = str(form_project["label"].id)
        normalized = validate_intake_form_fields(
            [
                {"key": "name", "source": "system", "required": True},
                {"key": "labels", "source": "system", "required": False, "allowed_ids": [label_id]},
                {"key": property_id, "source": "property", "property_id": property_id, "required": True},
            ],
            project_id=project.id,
            issue_type_id=form_project["issue_type"].id,
            types_enabled=True,
        )
        assert normalized[0]["key"] == "name"
        assert normalized[1]["allowed_ids"] == [label_id]
        assert normalized[2]["property_id"] == property_id

    def test_issue_type_required_when_enabled(self, form_project):
        with pytest.raises(ValueError, match="Work item type is required"):
            validate_issue_type_for_project(
                project_id=form_project["project"].id,
                issue_type_id=None,
                types_enabled=True,
            )
