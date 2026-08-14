# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations, models


def default_slack_dm_events():
    return ["create", "state", "assignee", "comment", "mention"]


def default_slack_dm_filter():
    return {}


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0129_slack_integration"),
    ]

    operations = [
        migrations.AddField(
            model_name="usernotificationpreference",
            name="slack_dm_events",
            field=models.JSONField(default=default_slack_dm_events),
        ),
        migrations.AddField(
            model_name="usernotificationpreference",
            name="slack_dm_filter",
            field=models.JSONField(default=default_slack_dm_filter),
        ),
        migrations.AddField(
            model_name="usernotificationpreference",
            name="slack_dm_custom_properties",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="slackchannelsubscription",
            name="custom_property_ids",
            field=models.JSONField(default=list),
        ),
    ]
