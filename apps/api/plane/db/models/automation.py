# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models

from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel


class Automation(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_enabled = models.BooleanField(default=False)
    trigger_type = models.CharField(max_length=64)
    trigger_config = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Automation"
        verbose_name_plural = "Automations"
        db_table = "automations"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["project", "trigger_type", "is_enabled"],
                name="automation_project_trigger_idx",
            ),
        ]

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class AutomationCondition(ProjectBaseModel):
    automation = models.ForeignKey(Automation, on_delete=models.CASCADE, related_name="conditions")
    group = models.PositiveIntegerField(default=0)
    field = models.CharField(max_length=64)
    operator = models.CharField(max_length=32)
    value = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Automation Condition"
        verbose_name_plural = "Automation Conditions"
        db_table = "automation_conditions"
        ordering = ("group", "order", "created_at")

    def __str__(self):
        return f"{self.field} {self.operator} <{self.automation_id}>"


class AutomationAction(ProjectBaseModel):
    automation = models.ForeignKey(Automation, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=64)
    config = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Automation Action"
        verbose_name_plural = "Automation Actions"
        db_table = "automation_actions"
        ordering = ("order", "created_at")

    def __str__(self):
        return f"{self.action_type} <{self.automation_id}>"


class AutomationRun(ProjectBaseModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    automation = models.ForeignKey(Automation, on_delete=models.CASCADE, related_name="runs")
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="automation_runs",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUCCESS)
    trigger_type = models.CharField(max_length=64)
    trigger_payload = models.JSONField(default=dict, blank=True)
    event_key = models.CharField(max_length=255, blank=True, default="")
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Automation Run"
        verbose_name_plural = "Automation Runs"
        db_table = "automation_runs"
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["automation", "event_key", "issue"],
                condition=models.Q(deleted_at__isnull=True) & ~models.Q(event_key=""),
                name="automation_run_idempotency_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.automation_id} {self.status}"


class AutomationRunStep(ProjectBaseModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    run = models.ForeignKey(AutomationRun, on_delete=models.CASCADE, related_name="steps")
    action = models.ForeignKey(
        AutomationAction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="run_steps",
    )
    action_type = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUCCESS)
    input = models.JSONField(default=dict, blank=True)
    output = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Automation Run Step"
        verbose_name_plural = "Automation Run Steps"
        db_table = "automation_run_steps"
        ordering = ("order", "created_at")

    def __str__(self):
        return f"{self.action_type} {self.status}"


class WorkspaceAutomationBot(WorkspaceBaseModel):
    """Maps a workspace to its dedicated Automation Bot user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="automation_bot_link",
    )

    class Meta:
        verbose_name = "Workspace Automation Bot"
        verbose_name_plural = "Workspace Automation Bots"
        db_table = "workspace_automation_bots"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_automation_bot_unique_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"Automation Bot <{self.workspace_id}>"
