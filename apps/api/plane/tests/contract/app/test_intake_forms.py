# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.authentication.rate_limit import IntakeFormSubmitThrottle
from plane.db.models import (
    Intake,
    IntakeForm,
    IntakeIssue,
    Issue,
    IssueProperty,
    IssueType,
    Label,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.db.models.issue_property import IssuePropertyType
from plane.db.models.intake import IntakeFormAccess, SourceType
from plane.db.models.state import StateGroup


def _anon_client():
    return APIClient()


def _forms_url(slug, project_id, pk=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/intake-forms/"
    if pk:
        return f"{base}{pk}/"
    return base


def _make_user(email):
    local = email.split("@")[0]
    user = User.objects.create(email=email, username=local, first_name=local)
    user.set_password("test-password")
    user.save()
    return user


@pytest.fixture
def intake_form_context(db, create_user, workspace):
    project = Project.objects.create(
        name="Intake Forms Project",
        identifier="IFP",
        workspace=workspace,
        created_by=create_user,
        intake_view=True,
        is_issue_type_enabled=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    Intake.objects.create(name="Default Intake", project=project, is_default=True)
    State.objects.create(
        name="Todo",
        project=project,
        workspace=workspace,
        group=StateGroup.BACKLOG.value,
        default=True,
    )
    issue_type = IssueType.objects.create(workspace=workspace, name="Bug", is_default=True, is_active=True)
    ProjectIssueType.objects.create(project=project, issue_type=issue_type, workspace=workspace, is_default=True)
    severity = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="Severity",
        property_type=IssuePropertyType.TEXT,
        is_active=True,
    )
    member_prop = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="Owner",
        property_type=IssuePropertyType.MEMBER,
        is_active=True,
    )
    label = Label.objects.create(workspace=workspace, project=project, name="Public")
    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "issue_type": issue_type,
        "severity": severity,
        "member_prop": member_prop,
        "label": label,
    }


@pytest.mark.contract
class TestIntakeFormAdminAPI:
    @pytest.mark.django_db
    def test_admin_can_create_and_retrieve_form(self, session_client, intake_form_context):
        project = intake_form_context["project"]
        workspace = intake_form_context["workspace"]
        issue_type = intake_form_context["issue_type"]
        response = session_client.post(
            _forms_url(workspace.slug, project.id),
            {
                "name": "Bug report",
                "access": "PUBLIC",
                "issue_type_id": str(issue_type.id),
                "fields": [
                    {"key": "name", "source": "system", "required": True},
                    {"key": "submitter_email", "source": "system", "required": True},
                ],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Bug report"
        assert response.data["anchor"]
        form_id = response.data["id"]
        retrieved = session_client.get(_forms_url(workspace.slug, project.id, form_id))
        assert retrieved.status_code == status.HTTP_200_OK
        assert retrieved.data["id"] == form_id

    @pytest.mark.django_db
    def test_rejects_member_property(self, session_client, intake_form_context):
        project = intake_form_context["project"]
        workspace = intake_form_context["workspace"]
        issue_type = intake_form_context["issue_type"]
        member_id = str(intake_form_context["member_prop"].id)
        response = session_client.post(
            _forms_url(workspace.slug, project.id),
            {
                "name": "Bad form",
                "issue_type_id": str(issue_type.id),
                "fields": [
                    {"key": "name", "source": "system", "required": True},
                    {"key": member_id, "source": "property", "property_id": member_id},
                ],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_guest_cannot_create_form(self, intake_form_context):
        project = intake_form_context["project"]
        workspace = intake_form_context["workspace"]
        guest = _make_user("guest-forms@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        response = client.post(
            _forms_url(workspace.slug, project.id),
            {"name": "Guest form", "issue_type_id": str(intake_form_context["issue_type"].id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_member_cannot_create_form(self, intake_form_context):
        project = intake_form_context["project"]
        workspace = intake_form_context["workspace"]
        member = _make_user("member-forms@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
        client = APIClient()
        client.force_authenticate(user=member)
        response = client.post(
            _forms_url(workspace.slug, project.id),
            {"name": "Member form", "issue_type_id": str(intake_form_context["issue_type"].id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_regenerate_anchor(self, session_client, intake_form_context):
        project = intake_form_context["project"]
        workspace = intake_form_context["workspace"]
        created = session_client.post(
            _forms_url(workspace.slug, project.id),
            {"name": "Rotate me", "issue_type_id": str(intake_form_context["issue_type"].id)},
            format="json",
        )
        old_anchor = created.data["anchor"]
        response = session_client.post(
            f"{_forms_url(workspace.slug, project.id, created.data['id'])}regenerate-anchor/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["anchor"] != old_anchor


@pytest.mark.contract
class TestIntakeFormPublicAPI:
    def _create_form(self, session_client, ctx, **overrides):
        payload = {
            "name": "Public bugs",
            "access": "PUBLIC",
            "issue_type_id": str(ctx["issue_type"].id),
            "fields": [
                {"key": "name", "source": "system", "required": True},
                {"key": "description", "source": "system", "required": False},
                {"key": "submitter_email", "source": "system", "required": True},
                {
                    "key": str(ctx["severity"].id),
                    "source": "property",
                    "property_id": str(ctx["severity"].id),
                    "required": False,
                },
            ],
        }
        payload.update(overrides)
        response = session_client.post(
            _forms_url(ctx["workspace"].slug, ctx["project"].id),
            payload,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        return response.data

    @pytest.mark.django_db
    def test_public_get_schema_and_unknown_anchor(self, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        ok = _anon_client().get(f"/api/public/forms/{form['anchor']}/")
        assert ok.status_code == status.HTTP_200_OK
        assert ok.data["name"] == "Public bugs"
        assert "workspace" not in ok.data
        missing = _anon_client().get("/api/public/forms/does-not-exist/")
        assert missing.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_disabled_form_is_404(self, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        session_client.patch(
            _forms_url(intake_form_context["workspace"].slug, intake_form_context["project"].id, form["id"]),
            {"is_enabled": False},
            format="json",
        )
        response = _anon_client().get(f"/api/public/forms/{form['anchor']}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    @patch("plane.space.views.form.issue_activity.delay")
    def test_anonymous_post_creates_pending_intake(self, _activity, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {
                "issue": {"name": "Broken login", "description_html": "<p>Details</p>"},
                "submitter_email": "reporter@example.com",
                "submitter_name": "Alex",
                "property_values": {str(intake_form_context["severity"].id): "high"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(name="Broken login")
        intake_issue = IntakeIssue.objects.get(issue=issue)
        assert intake_issue.source == SourceType.FORM
        assert intake_issue.source_email == "reporter@example.com"
        assert intake_issue.status == -2
        assert issue.state.group == StateGroup.TRIAGE.value
        assert issue.created_by_id is None

    @pytest.mark.django_db
    def test_required_fields_rejected(self, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {"issue": {"name": ""}, "submitter_email": "ok@example.com"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Issue.objects.filter(name="").count() == 0

    @pytest.mark.django_db
    def test_authenticated_form_rejects_anonymous(self, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context, access="AUTHENTICATED")
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {"issue": {"name": "Need login"}, "submitter_email": "a@example.com"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    @patch("plane.space.views.form.issue_activity.delay")
    def test_ignores_extra_properties_and_assignees(self, _activity, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {
                "issue": {
                    "name": "Ignore extras",
                    "assignee_ids": [str(intake_form_context["user"].id)],
                    "state_id": "00000000-0000-0000-0000-000000000000",
                },
                "submitter_email": "ok@example.com",
                "property_values": {"00000000-0000-0000-0000-000000000000": "nope"},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(name="Ignore extras")
        assert issue.assignees.count() == 0

    @pytest.mark.django_db
    @patch("plane.space.views.form.issue_activity.delay")
    def test_sanitizes_script_in_description(self, _activity, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {
                "issue": {
                    "name": "XSS attempt",
                    "description_html": "<p>hi</p><script>alert(1)</script>",
                },
                "submitter_email": "ok@example.com",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(name="XSS attempt")
        assert "<script" not in (issue.description_html or "").lower()

    @pytest.mark.django_db
    def test_honeypot_returns_204_without_creating(self, session_client, intake_form_context, api_client):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {"issue": {"name": "Bot"}, "submitter_email": "bot@example.com", "website": "http://spam"},
            format="json",
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert Issue.objects.filter(name="Bot").count() == 0

    @pytest.mark.django_db
    @patch.object(IntakeFormSubmitThrottle, "wait", return_value=1)
    @patch.object(IntakeFormSubmitThrottle, "allow_request", return_value=False)
    def test_submit_throttled(self, _throttle, _wait, session_client, intake_form_context):
        form = self._create_form(session_client, intake_form_context)
        response = _anon_client().post(
            f"/api/public/forms/{form['anchor']}/submissions/",
            {"issue": {"name": "Slow down"}, "submitter_email": "ok@example.com"},
            format="json",
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
