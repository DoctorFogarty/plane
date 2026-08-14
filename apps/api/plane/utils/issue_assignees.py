# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from plane.db.models import IssueAssignee


def live_assignee_ids(issue) -> list[str]:
    """Return active assignee ids. Django's M2M join includes soft-deleted through rows."""
    pk = getattr(issue, "pk", None)
    if pk is not None:
        return [
            str(uid)
            for uid in IssueAssignee.objects.filter(issue_id=pk)
            .order_by("created_at")
            .values_list("assignee_id", flat=True)
        ]
    assignees = getattr(issue, "assignees", None)
    if assignees is not None and hasattr(assignees, "values_list"):
        return [str(uid) for uid in assignees.values_list("id", flat=True)]
    return []


def live_assignee_names(issue, *, limit: int | None = None) -> list[str]:
    pk = getattr(issue, "pk", None)
    if pk is not None:
        qs = (
            IssueAssignee.objects.filter(issue_id=pk)
            .order_by("created_at")
            .values_list("assignee__display_name", flat=True)
        )
        if limit is not None:
            qs = qs[:limit]
        return [name for name in qs if name]
    assignees = getattr(issue, "assignees", None)
    if assignees is not None and hasattr(assignees, "values_list"):
        names = [name for name in assignees.values_list("display_name", flat=True) if name]
        return names[:limit] if limit is not None else names
    return []
