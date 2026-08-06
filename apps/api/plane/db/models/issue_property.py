# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.db.models import Q

from .project import ProjectBaseModel


class IssuePropertyType(models.TextChoices):
    TEXT = "TEXT", "Text"
    NUMBER = "NUMBER", "Number"
    DROPDOWN = "DROPDOWN", "Dropdown"
    BOOLEAN = "BOOLEAN", "Boolean"
    DATE = "DATE", "Date"
    MEMBER = "MEMBER", "Member picker"
    URL = "URL", "URL"


def get_default_property_settings():
    return {}


class IssueProperty(ProjectBaseModel):
    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="properties",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    property_type = models.CharField(
        max_length=50,
        choices=IssuePropertyType.choices,
        default=IssuePropertyType.TEXT,
    )
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    settings = models.JSONField(default=get_default_property_settings)

    class Meta:
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_unique_name_per_type_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            last_id = IssueProperty.objects.filter(
                project_id=self.project_id,
                issue_type_id=self.issue_type_id,
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if last_id is not None:
                self.sort_order = last_id + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.issue_type_id}>"


class IssuePropertyOption(ProjectBaseModel):
    property = models.ForeignKey(
        IssueProperty,
        on_delete=models.CASCADE,
        related_name="options",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_option_unique_name_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            last_id = IssuePropertyOption.objects.filter(property_id=self.property_id).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_id is not None:
                self.sort_order = last_id + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.property_id}>"


class IssuePropertyValue(ProjectBaseModel):
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="property_values",
    )
    property = models.ForeignKey(
        IssueProperty,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value_text = models.TextField(blank=True, null=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    value_number = models.FloatField(null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)
    value_uuid = models.UUIDField(null=True, blank=True)
    value_json = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "property"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_value_unique_issue_property_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.issue_id} - {self.property_id}"
