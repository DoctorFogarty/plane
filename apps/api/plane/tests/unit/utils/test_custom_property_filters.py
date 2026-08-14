# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyType,
    IssuePropertyValue,
    IssueType,
    Project,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.utils.filters.custom_property import (
    build_custom_property_filter_q,
    is_custom_property_filter_key,
    transform_custom_property_field_for_validation,
)
from plane.utils.filters.filter_backend import IssueComplexFilterBackend


@pytest.mark.unit
class TestCustomPropertyFilterHelpers:
    def test_is_custom_property_filter_key(self):
        property_id = uuid4()
        assert is_custom_property_filter_key(f"customproperty_{property_id}__exact") is True
        assert is_custom_property_filter_key(f"customproperty_{property_id}__in") is True
        assert is_custom_property_filter_key(f"customproperty_{property_id}__range") is True
        assert is_custom_property_filter_key("priority__in") is False
        assert is_custom_property_filter_key(f"customproperty_{property_id}__icontains") is False

    def test_transform_custom_property_field_for_validation(self):
        property_id = uuid4()
        assert (
            transform_custom_property_field_for_validation(f"customproperty_{property_id}__exact")
            == "customproperty_value"
        )
        assert (
            transform_custom_property_field_for_validation(f"customproperty_{property_id}__in")
            == "customproperty_value__in"
        )
        assert (
            transform_custom_property_field_for_validation(f"customproperty_{property_id}__range")
            == "customproperty_value__range"
        )
        assert transform_custom_property_field_for_validation("priority__in") == "priority__in"


@pytest.fixture
def custom_property_context(db, create_user):
    workspace = Workspace.objects.create(name="CP WS", slug="cp-filter-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="CP Project",
        identifier="CPF",
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
    )

    def make_property(name, property_type, settings=None):
        return IssueProperty.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            name=name,
            property_type=property_type,
            settings=settings or {},
            is_active=True,
            created_by=create_user,
        )

    def make_issue(name, priority="none"):
        return Issue.objects.create(
            name=name,
            project=project,
            workspace=workspace,
            state=state,
            type=issue_type,
            priority=priority,
            created_by=create_user,
        )

    return {
        "user": create_user,
        "workspace": workspace,
        "project": project,
        "state": state,
        "issue_type": issue_type,
        "make_property": make_property,
        "make_issue": make_issue,
    }


@pytest.mark.unit
@pytest.mark.django_db
class TestCustomPropertyFilterQ:
    def test_text_filter_uses_icontains(self, custom_property_context):
        ctx = custom_property_context
        prop = ctx["make_property"]("Summary", IssuePropertyType.TEXT)
        match = ctx["make_issue"]("Match")
        miss = ctx["make_issue"]("Miss")
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=match,
            property=prop,
            value_text="Critical path item",
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=miss,
            property=prop,
            value_text="Routine work",
        )

        q = build_custom_property_filter_q(f"customproperty_{prop.id}__exact", "critical")
        ids = set(Issue.objects.filter(q).values_list("id", flat=True))
        assert match.id in ids
        assert miss.id not in ids

    def test_number_and_boolean_filters(self, custom_property_context):
        ctx = custom_property_context
        points = ctx["make_property"]("Points", IssuePropertyType.NUMBER)
        blocked = ctx["make_property"]("Blocked", IssuePropertyType.BOOLEAN)
        high = ctx["make_issue"]("High")
        low = ctx["make_issue"]("Low")
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=high,
            property=points,
            value_number=8.0,
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=low,
            property=points,
            value_number=1.0,
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=high,
            property=blocked,
            value_boolean=True,
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=low,
            property=blocked,
            value_boolean=False,
        )

        number_ids = set(
            Issue.objects.filter(build_custom_property_filter_q(f"customproperty_{points.id}__exact", "8")).values_list(
                "id", flat=True
            )
        )
        assert number_ids == {high.id}

        bool_ids = set(
            Issue.objects.filter(
                build_custom_property_filter_q(f"customproperty_{blocked.id}__exact", "true")
            ).values_list("id", flat=True)
        )
        assert bool_ids == {high.id}

    def test_dropdown_and_member_filters(self, custom_property_context):
        ctx = custom_property_context
        dropdown = ctx["make_property"]("Severity", IssuePropertyType.DROPDOWN)
        option_a = IssuePropertyOption.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            property=dropdown,
            name="High",
            is_active=True,
        )
        option_b = IssuePropertyOption.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            property=dropdown,
            name="Low",
            is_active=True,
        )
        member_prop = ctx["make_property"]("Owner", IssuePropertyType.MEMBER)
        issue_a = ctx["make_issue"]("A")
        issue_b = ctx["make_issue"]("B")
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=issue_a,
            property=dropdown,
            value_uuid=option_a.id,
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=issue_b,
            property=dropdown,
            value_uuid=option_b.id,
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=issue_a,
            property=member_prop,
            value_uuid=ctx["user"].id,
        )

        dropdown_ids = set(
            Issue.objects.filter(
                build_custom_property_filter_q(f"customproperty_{dropdown.id}__in", str(option_a.id))
            ).values_list("id", flat=True)
        )
        assert dropdown_ids == {issue_a.id}

        member_ids = set(
            Issue.objects.filter(
                build_custom_property_filter_q(f"customproperty_{member_prop.id}__in", str(ctx["user"].id))
            ).values_list("id", flat=True)
        )
        assert member_ids == {issue_a.id}

    def test_date_range_filter(self, custom_property_context):
        ctx = custom_property_context
        prop = ctx["make_property"]("Review date", IssuePropertyType.DATE)
        inside = ctx["make_issue"]("Inside")
        outside = ctx["make_issue"]("Outside")
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=inside,
            property=prop,
            value_datetime=datetime(2025, 6, 15, tzinfo=timezone.utc),
        )
        IssuePropertyValue.objects.create(
            workspace=ctx["workspace"],
            project=ctx["project"],
            issue=outside,
            property=prop,
            value_datetime=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )

        ids = set(
            Issue.objects.filter(
                build_custom_property_filter_q(
                    f"customproperty_{prop.id}__range",
                    "2025-01-01,2025-12-31",
                )
            ).values_list("id", flat=True)
        )
        assert ids == {inside.id}

    def test_unknown_property_raises(self):
        with pytest.raises(DRFValidationError) as exc:
            build_custom_property_filter_q(f"customproperty_{uuid4()}__exact", "x")
        assert exc.value.detail["code"] == "invalid_custom_property_field"

    def test_backend_and_with_priority(self, custom_property_context):
        ctx = custom_property_context
        prop = ctx["make_property"]("Region", IssuePropertyType.TEXT)
        match = ctx["make_issue"]("Match", priority="urgent")
        wrong_priority = ctx["make_issue"]("Wrong priority", priority="low")
        wrong_text = ctx["make_issue"]("Wrong text", priority="urgent")
        for issue, text in ((match, "EMEA"), (wrong_priority, "EMEA"), (wrong_text, "APAC")):
            IssuePropertyValue.objects.create(
                workspace=ctx["workspace"],
                project=ctx["project"],
                issue=issue,
                property=prop,
                value_text=text,
            )

        class _View:
            filterset_class = __import__(
                "plane.utils.filters.filterset", fromlist=["IssueFilterSet"]
            ).IssueFilterSet

        backend = IssueComplexFilterBackend()
        qs = Issue.objects.filter(project=ctx["project"])
        filtered = backend.filter_queryset(
            request=None,
            queryset=qs,
            view=_View(),
            filter_data={
                "and": [
                    {f"customproperty_{prop.id}__exact": "emea"},
                    {"priority__in": "urgent"},
                ]
            },
        )
        assert set(filtered.values_list("id", flat=True)) == {match.id}
