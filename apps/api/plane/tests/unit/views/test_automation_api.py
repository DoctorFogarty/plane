# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import (
    Automation,
    AutomationAction,
    AutomationCondition,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)


@pytest.fixture
def automation_api_context(db, create_user):
    workspace = Workspace.objects.create(name="API WS", slug="api-auto-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Project",
        identifier="APIA",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return {"workspace": workspace, "project": project, "user": create_user}


@pytest.mark.unit
@pytest.mark.django_db
def test_create_list_and_enable_automation(session_client, automation_api_context):
    workspace = automation_api_context["workspace"]
    project = automation_api_context["project"]
    base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/automations/"

    create_resp = session_client.post(
        base,
        {
            "name": "On state change set priority",
            "description": "test",
            "trigger_type": "work_item.state_changed",
            "trigger_config": {},
            "is_enabled": False,
            "conditions": [],
            "actions": [
                {
                    "action_type": "change_property",
                    "order": 0,
                    "config": {"property": "priority", "change_type": "set", "value": "high"},
                }
            ],
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.content
    automation_id = create_resp.data["id"]
    assert create_resp.data["name"] == "On state change set priority"
    assert len(create_resp.data["actions"]) == 1

    list_resp = session_client.get(base)
    assert list_resp.status_code == 200
    assert any(item["id"] == automation_id for item in list_resp.data)

    enable_resp = session_client.patch(
        f"{base}{automation_id}/",
        {"is_enabled": True},
        format="json",
    )
    assert enable_resp.status_code == 200
    assert enable_resp.data["is_enabled"] is True

    delete_enabled = session_client.delete(f"{base}{automation_id}/")
    assert delete_enabled.status_code == 400

    session_client.patch(f"{base}{automation_id}/", {"is_enabled": False}, format="json")
    delete_resp = session_client.delete(f"{base}{automation_id}/")
    assert delete_resp.status_code == 204


@pytest.mark.unit
@pytest.mark.django_db
def test_partial_update_without_conditions_preserves_nested_rows(session_client, automation_api_context):
    workspace = automation_api_context["workspace"]
    project = automation_api_context["project"]
    user = automation_api_context["user"]

    automation = Automation.objects.create(
        project=project,
        workspace=workspace,
        name="With condition",
        is_enabled=False,
        trigger_type="work_item.state_changed",
        created_by=user,
    )
    AutomationCondition.objects.create(
        automation=automation,
        project=project,
        workspace=workspace,
        field="priority",
        operator="is",
        value={"value": "high"},
        order=0,
    )
    AutomationAction.objects.create(
        automation=automation,
        project=project,
        workspace=workspace,
        action_type="change_property",
        config={"property": "priority", "change_type": "set", "value": "urgent"},
        order=0,
    )

    base = f"/api/workspaces/{workspace.slug}/projects/{project.id}/automations/"
    resp = session_client.patch(
        f"{base}{automation.id}/",
        {
            "name": "Renamed",
            "actions": [
                {
                    "action_type": "change_property",
                    "order": 0,
                    "config": {"property": "priority", "change_type": "set", "value": "low"},
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["name"] == "Renamed"
    assert AutomationCondition.objects.filter(automation=automation, deleted_at__isnull=True).count() == 1
    assert resp.data["actions"][0]["config"]["value"] == "low"
