# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0132_tabbed_navigation_default"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="githubrepository",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("project", "repository_id"),
                name="github_repository_unique_project_repository_id_when_deleted_at_null",
            ),
        ),
    ]
