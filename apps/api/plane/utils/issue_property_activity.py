# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Activity + Slack side effects for custom property value changes."""

import json

from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from plane.app.serializers import IssueActivitySerializer
from plane.bgtasks.notification_task import notifications
from plane.bgtasks.slack_task import dispatch_slack_channel_event
from plane.db.models import IssueActivity, IssueProperty
from plane.settings.redis import redis_instance
from plane.utils.issue_property import format_property_value_for_display
from plane.utils.slack.transitions import activities_from_models, build_slack_headline


def record_property_value_activities(
    *,
    issue_id,
    project_id,
    workspace_id,
    actor,
    old_values,
    new_values,
    origin=None,
):
    epoch = timezone.now().timestamp()
    activities = []
    for property_id, new_value in new_values.items():
        old_value = old_values.get(property_id)
        if str(old_value) == str(new_value):
            continue
        property_obj = IssueProperty.objects.filter(pk=property_id).first()
        display_old = format_property_value_for_display(property_obj, old_value) if property_obj else None
        display_new = format_property_value_for_display(property_obj, new_value) if property_obj else None
        if display_old is None and old_value is not None:
            display_old = str(old_value)
        if display_new is None and new_value is not None:
            display_new = str(new_value)
        activities.append(
            IssueActivity(
                issue_id=issue_id,
                project_id=project_id,
                workspace_id=workspace_id,
                actor_id=actor.id,
                verb="updated",
                field=property_obj.name if property_obj else str(property_id),
                old_value=display_old,
                new_value=display_new,
                comment="updated the property",
                epoch=epoch,
                new_identifier=property_id,
            )
        )
    if not activities:
        return []

    created = IssueActivity.objects.bulk_create(activities, batch_size=20)
    if origin:
        redis_instance().set(str(issue_id), origin, ex=600)
    notifications.delay(
        type="issue_property.activity.updated",
        issue_id=issue_id,
        actor_id=actor.id,
        project_id=project_id,
        subscriber=True,
        issue_activities_created=json.dumps(
            IssueActivitySerializer(created, many=True).data,
            cls=DjangoJSONEncoder,
        ),
        requested_data=None,
        current_instance=None,
    )
    headline = build_slack_headline(
        actor,
        workspace_id,
        activities_from_models(created),
        event_type="issue_property.activity.updated",
    )
    dispatch_slack_channel_event.delay(
        str(project_id),
        str(issue_id),
        ["custom_property"],
        headline,
        [str(activity.new_identifier) for activity in created if activity.new_identifier],
    )
    return created
