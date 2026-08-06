# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State, StateGroup, ProjectStateGroup


class ProjectStateGroupSerializer(BaseSerializer):
    class Meta:
        model = ProjectStateGroup
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "description",
            "color",
            "sequence",
            "category",
            "is_system",
        ]
        read_only_fields = ["workspace", "project", "is_system"]

    def validate(self, attrs):
        category = attrs.get("category")
        if category == StateGroup.TRIAGE.value:
            raise serializers.ValidationError({"category": "Cannot create or assign triage category"})
        if self.instance and self.instance.is_system:
            if "category" in attrs and attrs["category"] != self.instance.category:
                raise serializers.ValidationError({"category": "Cannot change category of a system group"})
        return attrs


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)
    group_id = serializers.UUIDField(source="workflow_group_id", required=False, allow_null=True)

    class Meta:
        model = State
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "color",
            "group",
            "group_id",
            "default",
            "description",
            "sequence",
            "order",
        ]
        read_only_fields = ["workspace", "project"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")

        workflow_group = attrs.get("workflow_group")
        workflow_group_id = attrs.get("workflow_group_id")
        group_id = workflow_group_id or (workflow_group.id if workflow_group else None)

        if group_id:
            try:
                psg = ProjectStateGroup.all_objects.get(pk=group_id)
            except ProjectStateGroup.DoesNotExist:
                raise serializers.ValidationError({"group_id": "Invalid group"})
            if psg.category == StateGroup.TRIAGE.value:
                raise serializers.ValidationError({"group_id": "Cannot assign triage group"})
            attrs["workflow_group"] = psg
            attrs["group"] = psg.category
        return attrs

    def create(self, validated_data):
        project_id = self.context.get("project_id") or validated_data.get("project_id")
        if not validated_data.get("workflow_group") and validated_data.get("group"):
            group = (
                ProjectStateGroup.objects.filter(project_id=project_id, category=validated_data["group"])
                .order_by("sequence")
                .first()
            )
            if group:
                validated_data["workflow_group"] = group
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "workflow_group" in validated_data and validated_data["workflow_group"]:
            validated_data["group"] = validated_data["workflow_group"].category
        return super().update(instance, validated_data)


class StateLiteSerializer(BaseSerializer):
    group_id = serializers.UUIDField(source="workflow_group_id", read_only=True)

    class Meta:
        model = State
        fields = ["id", "name", "color", "group", "group_id"]
        read_only_fields = fields
