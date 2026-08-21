# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

# Django imports
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


def get_intake_form_anchor():
    return uuid4().hex


def get_default_intake_form_fields():
    return [
        {"key": "name", "source": "system", "required": True},
        {"key": "description", "source": "system", "required": False},
        {"key": "submitter_email", "source": "system", "required": True},
        {"key": "submitter_name", "source": "system", "required": False},
    ]


class Intake(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(verbose_name="Intake Description", blank=True)
    is_default = models.BooleanField(default=False)
    view_props = models.JSONField(default=dict)
    logo_props = models.JSONField(default=dict)

    def __str__(self):
        """Return name of the intake"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="intake_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Intake"
        verbose_name_plural = "Intakes"
        db_table = "intakes"
        ordering = ("name",)


class SourceType(models.TextChoices):
    IN_APP = "IN_APP"
    FORM = "FORM"


class IntakeFormAccess(models.TextChoices):
    PUBLIC = "PUBLIC"
    AUTHENTICATED = "AUTHENTICATED"


class IntakeForm(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    anchor = models.CharField(max_length=255, default=get_intake_form_anchor, unique=True, db_index=True)
    is_enabled = models.BooleanField(default=True)
    access = models.CharField(
        max_length=32,
        choices=IntakeFormAccess.choices,
        default=IntakeFormAccess.PUBLIC,
    )
    issue_type = models.ForeignKey(
        "db.IssueType",
        related_name="intake_forms",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    fields = models.JSONField(default=get_default_intake_form_fields)
    success_message = models.TextField(blank=True, default="Thank you. Your request has been submitted.")
    logo_props = models.JSONField(default=dict)

    def __str__(self):
        return f"{self.name} <{self.project.name}>"

    class Meta:
        verbose_name = "IntakeForm"
        verbose_name_plural = "IntakeForms"
        db_table = "intake_forms"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="intake_form_unique_name_project_when_deleted_at_null",
            )
        ]


class IntakeIssueStatus(models.IntegerChoices):
    PENDING = -2
    REJECTED = -1
    SNOOZED = 0
    ACCEPTED = 1
    DUPLICATE = 2


class IntakeIssue(ProjectBaseModel):
    intake = models.ForeignKey("db.Intake", related_name="issue_intake", on_delete=models.CASCADE)
    issue = models.ForeignKey("db.Issue", related_name="issue_intake", on_delete=models.CASCADE)
    status = models.IntegerField(
        choices=(
            (-2, "Pending"),
            (-1, "Rejected"),
            (0, "Snoozed"),
            (1, "Accepted"),
            (2, "Duplicate"),
        ),
        default=-2,
    )
    snoozed_till = models.DateTimeField(null=True)
    duplicate_to = models.ForeignKey(
        "db.Issue",
        related_name="intake_duplicate",
        on_delete=models.SET_NULL,
        null=True,
    )
    source = models.CharField(max_length=255, default="IN_APP", null=True, blank=True)
    source_email = models.TextField(blank=True, null=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    extra = models.JSONField(default=dict)

    class Meta:
        verbose_name = "IntakeIssue"
        verbose_name_plural = "IntakeIssues"
        db_table = "intake_issues"
        ordering = ("-created_at",)

    def __str__(self):
        """Return name of the Issue"""
        return f"{self.issue.name} <{self.intake.name}>"
