# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import (
    Automation,
    AutomationAction,
    AutomationCondition,
    AutomationRun,
    AutomationRunStep,
)
from plane.utils.automation.constants import (
    ACTION_TYPES,
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    TRIGGER_TYPES,
)


class AutomationConditionSerializer(BaseSerializer):
    class Meta:
        model = AutomationCondition
        fields = [
            "id",
            "group",
            "field",
            "operator",
            "value",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        field = attrs.get("field", getattr(self.instance, "field", None))
        operator = attrs.get("operator", getattr(self.instance, "operator", None))
        if field and field not in CONDITION_FIELDS:
            raise serializers.ValidationError({"field": f"Unsupported field: {field}"})
        if operator and operator not in CONDITION_OPERATORS:
            raise serializers.ValidationError({"operator": f"Unsupported operator: {operator}"})
        return attrs


class AutomationActionSerializer(BaseSerializer):
    class Meta:
        model = AutomationAction
        fields = [
            "id",
            "action_type",
            "config",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        action_type = attrs.get("action_type", getattr(self.instance, "action_type", None))
        if action_type and action_type not in ACTION_TYPES:
            raise serializers.ValidationError({"action_type": f"Unsupported action type: {action_type}"})
        return attrs


class AutomationSerializer(BaseSerializer):
    conditions = AutomationConditionSerializer(many=True, required=False)
    actions = AutomationActionSerializer(many=True, required=False)
    project = serializers.UUIDField(source="project_id", read_only=True)

    class Meta:
        model = Automation
        fields = [
            "id",
            "project",
            "name",
            "description",
            "is_enabled",
            "trigger_type",
            "trigger_config",
            "conditions",
            "actions",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "project", "created_at", "updated_at", "created_by"]

    def validate_trigger_type(self, value):
        if value not in TRIGGER_TYPES:
            raise serializers.ValidationError(f"Unsupported trigger type: {value}")
        return value

    def validate(self, attrs):
        is_enabled = attrs.get("is_enabled", getattr(self.instance, "is_enabled", False))
        if is_enabled:
            actions = attrs.get("actions")
            if actions is None and self.instance is not None:
                has_actions = self.instance.actions.filter(deleted_at__isnull=True).exists()
            else:
                has_actions = bool(actions)
            trigger_type = attrs.get("trigger_type", getattr(self.instance, "trigger_type", None))
            if not trigger_type or not has_actions:
                raise serializers.ValidationError(
                    "Automation must have a trigger and at least one action to be enabled."
                )
        return attrs

    def _sync_nested(self, automation, conditions_data, actions_data):
        project_id = automation.project_id
        workspace_id = automation.workspace_id

        if conditions_data is not None:
            automation.conditions.all().delete()
            for index, item in enumerate(conditions_data):
                AutomationCondition.objects.create(
                    automation=automation,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    group=item.get("group", 0),
                    field=item["field"],
                    operator=item["operator"],
                    value=item.get("value") or {},
                    order=item.get("order", index),
                )

        if actions_data is not None:
            automation.actions.all().delete()
            for index, item in enumerate(actions_data):
                AutomationAction.objects.create(
                    automation=automation,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    action_type=item["action_type"],
                    config=item.get("config") or {},
                    order=item.get("order", index),
                )

    def create(self, validated_data):
        conditions_data = validated_data.pop("conditions", [])
        actions_data = validated_data.pop("actions", [])
        project_id = self.context["project_id"]
        automation = Automation.objects.create(project_id=project_id, **validated_data)
        self._sync_nested(automation, conditions_data, actions_data)
        return automation

    def update(self, instance, validated_data):
        conditions_data = validated_data.pop("conditions", None)
        actions_data = validated_data.pop("actions", None)

        # Disallow changing trigger type after creation
        if "trigger_type" in validated_data and validated_data["trigger_type"] != instance.trigger_type:
            raise serializers.ValidationError({"trigger_type": "You can't change the trigger type once created"})

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        self._sync_nested(instance, conditions_data, actions_data)
        return instance


class AutomationListSerializer(BaseSerializer):
    conditions_count = serializers.IntegerField(read_only=True)
    actions_count = serializers.IntegerField(read_only=True)
    project = serializers.UUIDField(source="project_id", read_only=True)

    class Meta:
        model = Automation
        fields = [
            "id",
            "project",
            "name",
            "description",
            "is_enabled",
            "trigger_type",
            "trigger_config",
            "conditions_count",
            "actions_count",
            "created_at",
            "updated_at",
            "created_by",
        ]


class AutomationRunStepSerializer(BaseSerializer):
    class Meta:
        model = AutomationRunStep
        fields = [
            "id",
            "action_type",
            "status",
            "input",
            "output",
            "error",
            "order",
            "created_at",
        ]


class AutomationRunSerializer(BaseSerializer):
    steps = AutomationRunStepSerializer(many=True, read_only=True)
    issue_id = serializers.UUIDField(source="issue.id", read_only=True, allow_null=True)

    class Meta:
        model = AutomationRun
        fields = [
            "id",
            "automation",
            "issue_id",
            "status",
            "trigger_type",
            "trigger_payload",
            "started_at",
            "finished_at",
            "error",
            "steps",
            "created_at",
        ]
