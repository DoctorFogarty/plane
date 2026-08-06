# Generated manually for work item custom properties

import django.db.models.deletion
import plane.db.models.issue_property
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0122_alter_draftissue_assignees_alter_issue_assignees_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="IssueProperty",
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
                    "property_type",
                    models.CharField(
                        choices=[
                            ("TEXT", "Text"),
                            ("NUMBER", "Number"),
                            ("DROPDOWN", "Dropdown"),
                            ("BOOLEAN", "Boolean"),
                            ("DATE", "Date"),
                            ("MEMBER", "Member picker"),
                            ("URL", "URL"),
                        ],
                        default="TEXT",
                        max_length=50,
                    ),
                ),
                ("is_required", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.FloatField(default=65535)),
                ("settings", models.JSONField(default=plane.db.models.issue_property.get_default_property_settings)),
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
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="properties",
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
                "verbose_name": "Issue Property",
                "verbose_name_plural": "Issue Properties",
                "db_table": "issue_properties",
                "ordering": ("sort_order", "created_at"),
            },
        ),
        migrations.CreateModel(
            name="IssuePropertyOption",
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
                ("logo_props", models.JSONField(default=dict)),
                ("sort_order", models.FloatField(default=65535)),
                ("is_default", models.BooleanField(default=False)),
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
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="options",
                        to="db.issueproperty",
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
                "verbose_name": "Issue Property Option",
                "verbose_name_plural": "Issue Property Options",
                "db_table": "issue_property_options",
                "ordering": ("sort_order", "created_at"),
            },
        ),
        migrations.CreateModel(
            name="IssuePropertyValue",
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
                ("value_text", models.TextField(blank=True, null=True)),
                ("value_boolean", models.BooleanField(blank=True, null=True)),
                ("value_number", models.FloatField(blank=True, null=True)),
                ("value_datetime", models.DateTimeField(blank=True, null=True)),
                ("value_uuid", models.UUIDField(blank=True, null=True)),
                ("value_json", models.JSONField(blank=True, default=list)),
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
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="property_values",
                        to="db.issue",
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
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="db.issueproperty",
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
                "verbose_name": "Issue Property Value",
                "verbose_name_plural": "Issue Property Values",
                "db_table": "issue_property_values",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="issueproperty",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("project", "issue_type", "name"),
                name="issue_property_unique_name_per_type_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuepropertyoption",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("property", "name"),
                name="issue_property_option_unique_name_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuepropertyvalue",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue", "property"),
                name="issue_property_value_unique_issue_property_when_deleted_at_null",
            ),
        ),
    ]
