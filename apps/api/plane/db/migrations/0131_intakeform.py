# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import plane.db.models.intake


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0130_slack_notification_property_filters"),
    ]

    operations = [
        migrations.CreateModel(
            name="IntakeForm",
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
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                (
                    "anchor",
                    models.CharField(
                        db_index=True,
                        default=plane.db.models.intake.get_intake_form_anchor,
                        max_length=255,
                        unique=True,
                    ),
                ),
                ("is_enabled", models.BooleanField(default=True)),
                (
                    "access",
                    models.CharField(
                        choices=[("PUBLIC", "Public"), ("AUTHENTICATED", "Authenticated")],
                        default="PUBLIC",
                        max_length=32,
                    ),
                ),
                (
                    "fields",
                    models.JSONField(default=plane.db.models.intake.get_default_intake_form_fields),
                ),
                (
                    "success_message",
                    models.TextField(blank=True, default="Thank you. Your request has been submitted."),
                ),
                ("logo_props", models.JSONField(default=dict)),
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
                    "issue_type",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="intake_forms",
                        to="db.issuetype",
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
                "verbose_name": "IntakeForm",
                "verbose_name_plural": "IntakeForms",
                "db_table": "intake_forms",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="intakeform",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("name", "project"),
                name="intake_form_unique_name_project_when_deleted_at_null",
            ),
        ),
    ]
