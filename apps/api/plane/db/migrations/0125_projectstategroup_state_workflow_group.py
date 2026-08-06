# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


DEFAULT_STATE_GROUPS = [
    {"name": "Backlog", "color": "#d9d9d9", "sequence": 15000, "category": "backlog"},
    {"name": "Unstarted", "color": "#3f76ff", "sequence": 25000, "category": "unstarted"},
    {"name": "Started", "color": "#f59e0b", "sequence": 35000, "category": "started"},
    {"name": "Completed", "color": "#16a34a", "sequence": 45000, "category": "completed"},
    {"name": "Canceled", "color": "#dc2626", "sequence": 55000, "category": "cancelled"},
    {"name": "Triage", "color": "#4E5355", "sequence": 65000, "category": "triage", "is_system": True},
]


def seed_workflow_groups(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectStateGroup = apps.get_model("db", "ProjectStateGroup")
    State = apps.get_model("db", "State")

    projects = Project.objects.filter(deleted_at__isnull=True).iterator(chunk_size=100)
    for project in projects:
        category_to_group = {}
        groups_to_create = []
        for group_data in DEFAULT_STATE_GROUPS:
            groups_to_create.append(
                ProjectStateGroup(
                    name=group_data["name"],
                    color=group_data["color"],
                    sequence=group_data["sequence"],
                    category=group_data["category"],
                    is_system=group_data.get("is_system", False),
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                )
            )
        created = ProjectStateGroup.objects.bulk_create(groups_to_create)
        for group in created:
            category_to_group[group.category] = group

        states = State.objects.filter(project_id=project.id, deleted_at__isnull=True)
        for state in states:
            group = category_to_group.get(state.group)
            if group:
                state.workflow_group_id = group.id
                state.save(update_fields=["workflow_group_id"])


def unseed_workflow_groups(apps, schema_editor):
    ProjectStateGroup = apps.get_model("db", "ProjectStateGroup")
    State = apps.get_model("db", "State")
    State.objects.all().update(workflow_group_id=None)
    ProjectStateGroup.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0124_issuegithubbranch_issuegithubpullrequest"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectStateGroup",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255, verbose_name="Group Name")),
                ("description", models.TextField(blank=True, verbose_name="Group Description")),
                ("color", models.CharField(default="#60646C", max_length=255, verbose_name="Group Color")),
                ("slug", models.SlugField(blank=True, max_length=100)),
                ("sequence", models.FloatField(default=65535)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("backlog", "Backlog"),
                            ("unstarted", "Unstarted"),
                            ("started", "Started"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                            ("triage", "Triage"),
                        ],
                        default="backlog",
                        max_length=20,
                    ),
                ),
                ("is_system", models.BooleanField(default=False)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project State Group",
                "verbose_name_plural": "Project State Groups",
                "db_table": "project_state_groups",
                "ordering": ("sequence",),
                "unique_together": {("name", "project", "deleted_at")},
            },
        ),
        migrations.AddConstraint(
            model_name="projectstategroup",
            constraint=models.UniqueConstraint(
                condition=Q(("deleted_at__isnull", True)),
                fields=("name", "project"),
                name="projectstategroup_unique_name_project_when_deleted_at_null",
            ),
        ),
        migrations.AddField(
            model_name="state",
            name="workflow_group",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="states",
                to="db.projectstategroup",
            ),
        ),
        migrations.RunPython(seed_workflow_groups, unseed_workflow_groups),
    ]
