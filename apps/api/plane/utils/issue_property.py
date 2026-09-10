# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyType,
    IssuePropertyValue,
    IssueSubscriber,
    User,
)
from plane.utils.property_types import handler_for, is_empty, is_multi_select


def _is_empty(value):
    return is_empty(value)


def serialize_property_value(property_obj, value_obj):
    if value_obj is None:
        return None
    return handler_for(property_obj.property_type).serialize(property_obj, value_obj)


def clear_value_fields(value_obj: IssuePropertyValue):
    value_obj.value_text = None
    value_obj.value_boolean = None
    value_obj.value_number = None
    value_obj.value_datetime = None
    value_obj.value_uuid = None
    value_obj.value_json = []


def apply_value_to_model(property_obj: IssueProperty, value_obj: IssuePropertyValue, value):
    clear_value_fields(value_obj)
    if _is_empty(value):
        return value_obj
    handler_for(property_obj.property_type).apply(property_obj, value_obj, value)
    return value_obj


def validate_property_value(property_obj: IssueProperty, value, project_id):
    if _is_empty(value):
        if property_obj.is_required and property_obj.is_active:
            return f"Property '{property_obj.name}' is required"
        return None
    return handler_for(property_obj.property_type).validate(property_obj, value, project_id)


def upsert_property_values(
    *,
    issue,
    project_id,
    workspace_id,
    property_values: dict,
    actor_id=None,
    validate_required=True,
):
    """
    Upsert property values for an issue.
    property_values: { property_id: value }
    Returns (values_map, errors)
    """
    if not property_values:
        property_values = {}

    properties = {
        str(p.id): p
        for p in IssueProperty.objects.filter(
            project_id=project_id,
            issue_type_id=issue.type_id,
            is_active=True,
        )
    }

    errors = {}
    result = {}
    member_ids_to_subscribe = set()

    if validate_required:
        for property_id, property_obj in properties.items():
            if property_obj.is_required and property_id not in property_values:
                # allow existing value to satisfy required
                existing = IssuePropertyValue.objects.filter(issue_id=issue.id, property_id=property_id).first()
                if existing is None or _is_empty(serialize_property_value(property_obj, existing)):
                    errors[property_id] = f"Property '{property_obj.name}' is required"

    for property_id, value in property_values.items():
        property_obj = properties.get(str(property_id))
        if not property_obj:
            errors[str(property_id)] = "Property not found for this work item type"
            continue

        error = validate_property_value(property_obj, value, project_id)
        if error:
            errors[str(property_id)] = error
            continue

        value_obj, _created = IssuePropertyValue.objects.get_or_create(
            issue_id=issue.id,
            property_id=property_obj.id,
            defaults={
                "project_id": project_id,
                "workspace_id": workspace_id,
                "created_by_id": actor_id,
                "updated_by_id": actor_id,
            },
        )
        apply_value_to_model(property_obj, value_obj, value)
        value_obj.updated_by_id = actor_id
        value_obj.save()
        result[str(property_id)] = serialize_property_value(property_obj, value_obj)

        if property_obj.property_type == IssuePropertyType.MEMBER and not _is_empty(value):
            multi = is_multi_select(property_obj)
            ids = value if multi else [value]
            if not isinstance(ids, list):
                ids = [ids]
            member_ids_to_subscribe.update(str(i) for i in ids if i)

    if member_ids_to_subscribe:
        existing = set(
            str(sid)
            for sid in IssueSubscriber.objects.filter(
                issue_id=issue.id,
                subscriber_id__in=member_ids_to_subscribe,
            ).values_list("subscriber_id", flat=True)
        )
        IssueSubscriber.objects.bulk_create(
            [
                IssueSubscriber(
                    issue_id=issue.id,
                    subscriber_id=member_id,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    created_by_id=actor_id,
                    updated_by_id=actor_id,
                )
                for member_id in member_ids_to_subscribe
                if member_id not in existing
            ],
            ignore_conflicts=True,
            batch_size=20,
        )

    return result, errors


def get_issue_property_values_map(issue_id, project_id=None):
    qs = IssuePropertyValue.objects.filter(issue_id=issue_id).select_related("property")
    if project_id:
        qs = qs.filter(project_id=project_id)
    return {str(v.property_id): serialize_property_value(v.property, v) for v in qs}


def get_issues_property_values_maps(issue_ids, project_id=None):
    """
    Bulk-load property values for many issues.
    Returns { issue_id: { property_id: value } }. Issues with no values get {}.
    """
    result = {str(issue_id): {} for issue_id in issue_ids}
    if not issue_ids:
        return result

    qs = IssuePropertyValue.objects.filter(issue_id__in=issue_ids).select_related("property")
    if project_id:
        qs = qs.filter(project_id=project_id)

    for value_obj in qs:
        issue_key = str(value_obj.issue_id)
        if issue_key not in result:
            result[issue_key] = {}
        result[issue_key][str(value_obj.property_id)] = serialize_property_value(
            value_obj.property, value_obj
        )
    return result


def format_property_value_for_display(property_obj, value):
    """
    Resolve stored property values (option/member UUIDs) to human-readable labels
    for activity logs and similar display surfaces.
    """
    if _is_empty(value):
        return None

    property_type = property_obj.property_type

    if property_type == IssuePropertyType.BOOLEAN:
        return "Yes" if value else "No"

    if property_type == IssuePropertyType.DROPDOWN:
        ids = value if isinstance(value, list) else [value]
        option_map = {
            str(oid): name
            for oid, name in IssuePropertyOption.objects.filter(
                property_id=property_obj.id,
                id__in=ids,
            ).values_list("id", "name")
        }
        labels = [option_map.get(str(i), str(i)) for i in ids if i is not None]
        return ", ".join(labels) if labels else None

    if property_type == IssuePropertyType.MEMBER:
        ids = value if isinstance(value, list) else [value]
        user_map = {
            str(uid): display_name or email
            for uid, display_name, email in User.objects.filter(id__in=ids).values_list(
                "id", "display_name", "email"
            )
        }
        labels = [user_map.get(str(i), str(i)) for i in ids if i is not None]
        return ", ".join(labels) if labels else None

    if property_type == IssuePropertyType.DATE:
        return str(value)[:10] if value is not None else None

    if isinstance(value, list):
        return ", ".join(str(v) for v in value)

    return str(value)
