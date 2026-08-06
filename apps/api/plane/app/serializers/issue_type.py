# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import (
    IssueType,
    ProjectIssueType,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssuePropertyType,
)


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = [
            "id",
            "property_id",
            "name",
            "description",
            "logo_props",
            "sort_order",
            "is_default",
            "is_active",
            "project_id",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "property"]


class IssuePropertySerializer(BaseSerializer):
    options = IssuePropertyOptionSerializer(many=True, read_only=True)
    issue_type_id = serializers.UUIDField(source="issue_type.id", read_only=True)

    class Meta:
        model = IssueProperty
        fields = [
            "id",
            "issue_type_id",
            "name",
            "description",
            "property_type",
            "is_required",
            "is_active",
            "sort_order",
            "settings",
            "options",
            "project_id",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "issue_type"]

    def validate(self, attrs):
        property_type = attrs.get("property_type") or getattr(self.instance, "property_type", None)
        is_required = attrs.get("is_required", getattr(self.instance, "is_required", False))
        settings = attrs.get("settings", getattr(self.instance, "settings", {}) or {})

        if property_type == IssuePropertyType.BOOLEAN and is_required:
            raise serializers.ValidationError({"is_required": "Boolean properties cannot be mandatory"})

        if property_type == IssuePropertyType.TEXT:
            text_format = settings.get("display_format") or settings.get("format")
            if text_format == "readonly" and is_required:
                raise serializers.ValidationError({"is_required": "Read-only text properties cannot be mandatory"})

        return attrs


class IssueTypeSerializer(BaseSerializer):
    is_default = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()
    project_issue_type_id = serializers.SerializerMethodField()
    properties = serializers.SerializerMethodField()

    class Meta:
        model = IssueType
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_active",
            "is_default",
            "level",
            "project_issue_type_id",
            "properties",
            "workspace_id",
            "created_at",
            "updated_at",
            "external_source",
            "external_id",
        ]
        read_only_fields = ["workspace"]

    def _project_issue_type(self, obj):
        project_id = self.context.get("project_id")
        if not project_id:
            return None
        if hasattr(obj, "_prefetched_project_issue_types"):
            for pit in obj._prefetched_project_issue_types:
                if str(pit.project_id) == str(project_id):
                    return pit
        return ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=obj.id).first()

    def get_is_default(self, obj):
        pit = self._project_issue_type(obj)
        return bool(pit and pit.is_default)

    def get_level(self, obj):
        pit = self._project_issue_type(obj)
        return pit.level if pit else obj.level

    def get_project_issue_type_id(self, obj):
        pit = self._project_issue_type(obj)
        return str(pit.id) if pit else None

    def get_properties(self, obj):
        project_id = self.context.get("project_id")
        include_properties = self.context.get("include_properties", True)
        if not include_properties or not project_id:
            return []
        properties = IssueProperty.objects.filter(
            project_id=project_id,
            issue_type_id=obj.id,
        ).prefetch_related("options")
        return IssuePropertySerializer(properties, many=True).data


class IssuePropertyValueSerializer(BaseSerializer):
    property_id = serializers.UUIDField(source="property.id", read_only=True)
    issue_id = serializers.UUIDField(source="issue.id", read_only=True)
    value = serializers.SerializerMethodField()

    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue_id",
            "property_id",
            "value",
            "project_id",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_value(self, obj):
        property_type = obj.property.property_type
        if property_type == IssuePropertyType.BOOLEAN:
            return obj.value_boolean
        if property_type == IssuePropertyType.NUMBER:
            return obj.value_number
        if property_type == IssuePropertyType.DATE:
            return obj.value_datetime.isoformat() if obj.value_datetime else None
        if property_type in (IssuePropertyType.DROPDOWN, IssuePropertyType.MEMBER):
            multi = (obj.property.settings or {}).get("is_multi") or (obj.property.settings or {}).get(
                "display_format"
            ) == "multi"
            if multi or (isinstance(obj.value_json, list) and len(obj.value_json) > 0):
                return obj.value_json or []
            return str(obj.value_uuid) if obj.value_uuid else None
        return obj.value_text
