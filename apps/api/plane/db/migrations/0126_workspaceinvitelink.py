# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import plane.db.models.workspace


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0125_projectstategroup_state_workflow_group"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceInviteLink",
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
                (
                    "anchor",
                    models.CharField(
                        db_index=True,
                        default=plane.db.models.workspace.get_workspace_invite_link_anchor,
                        max_length=255,
                        unique=True,
                    ),
                ),
                (
                    "role",
                    models.PositiveSmallIntegerField(choices=[(15, "Member"), (5, "Guest")], default=15),
                ),
                ("is_active", models.BooleanField(default=True)),
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
                    "project",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
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
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Workspace Invite Link",
                "verbose_name_plural": "Workspace Invite Links",
                "db_table": "workspace_invite_links",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "deleted_at")},
            },
        ),
        migrations.AddConstraint(
            model_name="workspaceinvitelink",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace",),
                name="workspace_invite_link_unique_workspace_when_deleted_at_null",
            ),
        ),
    ]
