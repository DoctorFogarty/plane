# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


def set_tabbed_navigation_default(apps, _schema_editor):
    WorkspaceUserProperties = apps.get_model("db", "WorkspaceUserProperties")
    WorkspaceUserProperties.objects.filter(navigation_control_preference="ACCORDION").update(
        navigation_control_preference="TABBED"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0131_intakeform"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workspaceuserproperties",
            name="navigation_control_preference",
            field=models.CharField(
                choices=[("ACCORDION", "Accordion"), ("TABBED", "Tabbed")],
                default="TABBED",
                max_length=25,
            ),
        ),
        migrations.RunPython(set_tabbed_navigation_default, migrations.RunPython.noop),
    ]
