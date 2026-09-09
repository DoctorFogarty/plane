# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

# Module imports
from .base import DynamicBaseSerializer
from plane.db.models import IssueView


class IssueViewSerializer(DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueView
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "query",
            "owned_by",
            "access",
            "is_locked",
        ]

    def create(self, validated_data):
        try:
            return IssueView.objects.create(**validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else {"filters": exc.messages})

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else {"filters": exc.messages})
