# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0126_workspaceinvitelink"),
    ]

    operations = [
        migrations.AddField(
            model_name="draftissue",
            name="property_values",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
