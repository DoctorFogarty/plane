# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Module import
from .workspace import WorkspaceBaseModel
from plane.utils.view_preferences import (
    ViewQueryCompileError,
    compile_issue_view_query,
    get_default_display_filters,
    get_default_display_properties,
)


class IssueView(WorkspaceBaseModel):
    name = models.CharField(max_length=255, verbose_name="View Name")
    description = models.TextField(verbose_name="View Description", blank=True)
    query = models.JSONField(verbose_name="View Query")
    filters = models.JSONField(default=dict)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    access = models.PositiveSmallIntegerField(default=1, choices=((0, "Private"), (1, "Public")))
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="views")
    is_locked = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "Issue View"
        verbose_name_plural = "Issue Views"
        db_table = "issue_views"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        try:
            compiled, rich_filters = compile_issue_view_query(self.filters, self.rich_filters)
        except ViewQueryCompileError as exc:
            raise ValidationError({"filters": str(exc)}) from exc
        self.query = compiled
        if not self.rich_filters and rich_filters:
            self.rich_filters = rich_filters

        if self._state.adding:
            if self.project:
                largest_sort_order = IssueView.objects.filter(project=self.project).aggregate(
                    largest=models.Max("sort_order")
                )["largest"]
            else:
                largest_sort_order = IssueView.objects.filter(workspace=self.workspace, project__isnull=True).aggregate(
                    largest=models.Max("sort_order")
                )["largest"]
            if largest_sort_order is not None:
                self.sort_order = largest_sort_order + 10000

        super(IssueView, self).save(*args, **kwargs)

    def __str__(self):
        """Return name of the View"""
        return f"{self.name} <{self.project.name}>"
