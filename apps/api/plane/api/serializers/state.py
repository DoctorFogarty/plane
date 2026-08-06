# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from plane.db.models import State, StateGroup, ProjectStateGroup
from rest_framework import serializers


class ProjectStateGroupSerializer(BaseSerializer):
    class Meta:
        model = ProjectStateGroup
        fields = [
            "id",
            "name",
            "description",
            "color",
            "sequence",
            "category",
            "is_system",
            "project_id",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "is_system",
        ]

    def validate(self, attrs):
        if attrs.get("category") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError({"category": "Cannot create or assign triage category"})
        return attrs


class StateSerializer(BaseSerializer):
    """
    Serializer for work item states with default state management.

    Handles state creation and updates including default state validation
    and automatic default state switching for workflow management.
    """

    group_id = serializers.UUIDField(source="workflow_group_id", required=False, allow_null=True)

    def validate(self, data):
        # If the default is being provided then make all other states default False
        if data.get("default", False):
            State.objects.filter(project_id=self.context.get("project_id")).update(default=False)

        if data.get("group", None) == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")

        workflow_group_id = data.get("workflow_group_id")
        if workflow_group_id:
            try:
                psg = ProjectStateGroup.all_objects.get(pk=workflow_group_id)
            except ProjectStateGroup.DoesNotExist:
                raise serializers.ValidationError({"group_id": "Invalid group"})
            if psg.category == StateGroup.TRIAGE.value:
                raise serializers.ValidationError({"group_id": "Cannot assign triage group"})
            data["workflow_group"] = psg
            data["group"] = psg.category
        return data

    def create(self, validated_data):
        project_id = self.context.get("project_id")
        if not validated_data.get("workflow_group") and validated_data.get("group"):
            group = (
                ProjectStateGroup.objects.filter(project_id=project_id, category=validated_data["group"])
                .order_by("sequence")
                .first()
            )
            if group:
                validated_data["workflow_group"] = group
        return super().create(validated_data)

    class Meta:
        model = State
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "deleted_at",
            "slug",
        ]


class StateLiteSerializer(BaseSerializer):
    """
    Lightweight state serializer for minimal data transfer.

    Provides essential state information including visual properties
    and grouping data optimized for UI display and filtering.
    """

    group_id = serializers.UUIDField(source="workflow_group_id", read_only=True)

    class Meta:
        model = State
        fields = ["id", "name", "color", "group", "group_id"]
        read_only_fields = fields
