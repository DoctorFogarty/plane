# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.template.defaultfilters import slugify
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel
from plane.db.mixins import SoftDeletionManager


class StateGroup(models.TextChoices):
    BACKLOG = "backlog", "Backlog"
    UNSTARTED = "unstarted", "Unstarted"
    STARTED = "started", "Started"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    TRIAGE = "triage", "Triage"


# Default workflow groups (project-scoped display groups with fixed categories)
DEFAULT_STATE_GROUPS = [
    {
        "name": "Backlog",
        "color": "#d9d9d9",
        "sequence": 15000,
        "category": StateGroup.BACKLOG.value,
    },
    {
        "name": "Unstarted",
        "color": "#3f76ff",
        "sequence": 25000,
        "category": StateGroup.UNSTARTED.value,
    },
    {
        "name": "Started",
        "color": "#f59e0b",
        "sequence": 35000,
        "category": StateGroup.STARTED.value,
    },
    {
        "name": "Completed",
        "color": "#16a34a",
        "sequence": 45000,
        "category": StateGroup.COMPLETED.value,
    },
    {
        "name": "Canceled",
        "color": "#dc2626",
        "sequence": 55000,
        "category": StateGroup.CANCELLED.value,
    },
    {
        "name": "Triage",
        "color": "#4E5355",
        "sequence": 65000,
        "category": StateGroup.TRIAGE.value,
        "is_system": True,
    },
]

# Default states
DEFAULT_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": StateGroup.BACKLOG.value,
    },
    {
        "name": "Todo",
        "color": "#60646C",
        "sequence": 25000,
        "group": StateGroup.UNSTARTED.value,
    },
    {
        "name": "In Progress",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Done",
        "color": "#46A758",
        "sequence": 45000,
        "group": StateGroup.COMPLETED.value,
    },
    {
        "name": "Cancelled",
        "color": "#9AA4BC",
        "sequence": 55000,
        "group": StateGroup.CANCELLED.value,
    },
    {
        "name": "Triage",
        "color": "#4E5355",
        "sequence": 65000,
        "group": StateGroup.TRIAGE.value,
    },
]

# Categories that must retain at least one group per project
REQUIRED_STATE_GROUP_CATEGORIES = [
    StateGroup.BACKLOG.value,
    StateGroup.UNSTARTED.value,
    StateGroup.STARTED.value,
    StateGroup.COMPLETED.value,
    StateGroup.CANCELLED.value,
]


class ProjectStateGroupManager(SoftDeletionManager):
    """Default manager - excludes triage/system groups"""

    def get_queryset(self):
        return super().get_queryset().exclude(category=StateGroup.TRIAGE.value)


class ProjectStateGroupTriageManager(SoftDeletionManager):
    """Manager for triage groups only"""

    def get_queryset(self):
        return super().get_queryset().filter(category=StateGroup.TRIAGE.value)


class ProjectStateGroup(ProjectBaseModel):
    """Project-scoped display group for workflow states, mapped to a fixed behavior category."""

    name = models.CharField(max_length=255, verbose_name="Group Name")
    description = models.TextField(verbose_name="Group Description", blank=True)
    color = models.CharField(max_length=255, verbose_name="Group Color", default="#60646C")
    slug = models.SlugField(max_length=100, blank=True)
    sequence = models.FloatField(default=65535)
    category = models.CharField(
        choices=StateGroup.choices,
        default=StateGroup.BACKLOG,
        max_length=20,
    )
    is_system = models.BooleanField(default=False)

    objects = ProjectStateGroupManager()
    all_objects = SoftDeletionManager()
    triage_objects = ProjectStateGroupTriageManager()

    def __str__(self):
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="projectstategroup_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Project State Group"
        verbose_name_plural = "Project State Groups"
        db_table = "project_state_groups"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        if self._state.adding and (self.sequence is None or self.sequence == 65535):
            last_id = (
                ProjectStateGroup.all_objects.filter(project=self.project)
                .exclude(category=StateGroup.TRIAGE.value)
                .aggregate(largest=models.Max("sequence"))["largest"]
            )
            if last_id is not None:
                self.sequence = last_id + 15000
        return super().save(*args, **kwargs)


class StateManager(SoftDeletionManager):
    """Default manager - excludes triage states"""

    def get_queryset(self):
        return super().get_queryset().exclude(group=StateGroup.TRIAGE.value)


class TriageStateManager(SoftDeletionManager):
    """Manager for triage states only"""

    def get_queryset(self):
        return super().get_queryset().filter(group=StateGroup.TRIAGE.value)


class State(ProjectBaseModel):
    name = models.CharField(max_length=255, verbose_name="State Name")
    description = models.TextField(verbose_name="State Description", blank=True)
    color = models.CharField(max_length=255, verbose_name="State Color")
    slug = models.SlugField(max_length=100, blank=True)
    sequence = models.FloatField(default=65535)
    # Behavioral category (denormalized from workflow_group.category for query compatibility)
    group = models.CharField(
        choices=StateGroup.choices,
        default=StateGroup.BACKLOG,
        max_length=20,
    )
    # Project-scoped display group
    workflow_group = models.ForeignKey(
        "db.ProjectStateGroup",
        on_delete=models.SET_NULL,
        related_name="states",
        null=True,
        blank=True,
    )
    is_triage = models.BooleanField(default=False)
    default = models.BooleanField(default=False)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    objects = StateManager()
    all_state_objects = models.Manager()
    triage_objects = TriageStateManager()

    def __str__(self):
        """Return name of the state"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="state_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "State"
        verbose_name_plural = "States"
        db_table = "states"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        # Auto-assign a workflow group from category when missing
        if not self.workflow_group_id and self.group and self.project_id:
            group = (
                ProjectStateGroup.all_objects.filter(project_id=self.project_id, category=self.group)
                .order_by("sequence")
                .first()
            )
            if group:
                self.workflow_group = group
        # Keep behavioral category in sync with the workflow group
        if self.workflow_group_id:
            # Avoid extra query when category already matches a prefetched/set group
            if hasattr(self, "workflow_group") and self.workflow_group is not None:
                self.group = self.workflow_group.category
            else:
                category = (
                    ProjectStateGroup.all_objects.filter(pk=self.workflow_group_id)
                    .values_list("category", flat=True)
                    .first()
                )
                if category:
                    self.group = category
        if self._state.adding:
            # Get the maximum sequence value from the database
            last_id = State.objects.filter(project=self.project).aggregate(largest=models.Max("sequence"))["largest"]
            # if last_id is not None
            if last_id is not None:
                self.sequence = last_id + 15000

        return super().save(*args, **kwargs)


def seed_project_state_groups(project, created_by=None):
    """Create default ProjectStateGroup rows for a project. Returns category -> group map."""
    # Skip if groups already exist for this project
    existing = list(ProjectStateGroup.all_objects.filter(project=project))
    if existing:
        return {g.category: g for g in existing}

    # Accept either a User instance or a raw user id
    created_by_kwargs = {}
    if created_by is not None:
        if hasattr(created_by, "pk"):
            created_by_kwargs["created_by"] = created_by
        else:
            created_by_kwargs["created_by_id"] = created_by

    groups = [
        ProjectStateGroup(
            name=group_data["name"],
            color=group_data["color"],
            sequence=group_data["sequence"],
            category=group_data["category"],
            is_system=group_data.get("is_system", False),
            project=project,
            workspace=project.workspace,
            **created_by_kwargs,
        )
        for group_data in DEFAULT_STATE_GROUPS
    ]
    created = ProjectStateGroup.all_objects.bulk_create(groups)
    return {g.category: g for g in created}
