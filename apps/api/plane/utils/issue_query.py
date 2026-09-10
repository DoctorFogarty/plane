# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared board-query pipeline for project / cycle / module / archive / workspace lists."""

import json
from collections import namedtuple

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Count, OuterRef, Q, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE
from plane.db.models import CycleIssue, FileAsset, Issue, IssueLink, IssueView, Project, ProjectMember
from plane.utils.filters import IssueComplexFilterBackend, LegacyToRichFiltersConverter
from plane.utils.grouper import (
    ISSUE_BOARD_FIELDS,
    annotate_issue_relation_ids,
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.issue_filters import apply_issue_filters, issue_filters
from plane.utils.issue_property import get_issues_property_values_maps
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator
from plane.utils.timezone_converter import user_timezone_converter

PreparedIssueBoard = namedtuple(
    "PreparedIssueBoard",
    ("issue_queryset", "filtered_issue_queryset", "filters", "order_by_param", "group_by", "sub_group_by"),
)

INTAKE_BOARD_COUNT_FILTER = Q(
    Q(issue_intake__status=1) | Q(issue_intake__status=-1) | Q(issue_intake__status=2) | Q(issue_intake__isnull=True),
    archived_at__isnull=True,
    is_draft=False,
)

_FALSEY_GROUP_VALUES = {"", "false", "none", "null"}


class InvalidBoardGrouping(ValueError):
    """Raised when group_by and sub_group_by name the same field."""


class SavedViewNotFound(ValueError):
    """Raised when `view_id` does not resolve to a workspace/project saved view."""


def _parse_request_filter_tree(request):
    raw = request.query_params.get("filters")
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw or None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed or None


def resolve_saved_view_filters(request, *, slug, project_id=None):
    """Load a saved view's rich filter tree, or None when `view_id` is absent."""
    view_id = request.query_params.get("view_id")
    if not view_id:
        return None

    queryset = IssueView.objects.filter(workspace__slug=slug, pk=view_id, archived_at__isnull=True)
    if project_id:
        queryset = queryset.filter(Q(project_id=project_id) | Q(project__isnull=True))
    else:
        queryset = queryset.filter(project__isnull=True)

    issue_view = queryset.only("rich_filters", "filters").first()
    if issue_view is None:
        raise SavedViewNotFound("view_id is not valid")
    if issue_view.rich_filters:
        return issue_view.rich_filters
    if issue_view.filters:
        return LegacyToRichFiltersConverter().convert(issue_view.filters, strict=False) or None
    return None


def _merge_filter_trees(*trees):
    present = [tree for tree in trees if tree]
    if not present:
        return None
    if len(present) == 1:
        return present[0]
    return {"and": present}


def parse_group_param(value):
    """Normalize query-param group keys. Missing / falsey values become None."""
    if value is None or value is False:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.lower() in _FALSEY_GROUP_VALUES:
            return None
        return stripped
    return str(value)


def annotate_issue_board_qs(queryset):
    """Board-row annotations shared by list, create response, and retrieve helpers."""
    return queryset.annotate(
        cycle_id=Subquery(
            CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
        ),
        link_count=Subquery(
            IssueLink.objects.filter(issue=OuterRef("id")).values("issue").annotate(count=Count("id")).values("count")
        ),
        attachment_count=Subquery(
            FileAsset.objects.filter(
                issue_id=OuterRef("id"),
                entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            )
            .values("issue_id")
            .annotate(count=Count("id"))
            .values("count")
        ),
        sub_issues_count=Subquery(
            Issue.issue_objects.filter(parent=OuterRef("id"))
            .values("parent")
            .annotate(count=Count("id"))
            .values("count")
        ),
    )


def annotate_issue_detail_qs(queryset):
    """Board counts plus relation IDs — the retrieve / identifier / paginated row."""
    return annotate_issue_relation_ids(annotate_issue_board_qs(queryset))


def is_restricted_guest(*, slug, project_id, user, project=None):
    if project is None:
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
    if project is None:
        return False
    is_guest = ProjectMember.objects.filter(
        workspace__slug=slug,
        project_id=project_id,
        member=user,
        role=ROLE.GUEST.value,
        is_active=True,
    ).exists()
    return bool(is_guest and not project.guest_view_all_features)


def restrict_guest_issues(queryset, *, slug, project_id, user, project=None):
    if is_restricted_guest(slug=slug, project_id=project_id, user=user, project=project):
        return queryset.filter(created_by=user)
    return queryset


def guest_issue_access_q(user):
    """Workspace-scoped Q: guests see own issues unless the project opens all features."""
    return Q(
        Q(
            project__project_projectmember__role=ROLE.GUEST.value,
            project__guest_view_all_features=True,
        )
        | Q(
            project__project_projectmember__role=ROLE.GUEST.value,
            project__guest_view_all_features=False,
            created_by=user,
        )
        | Q(project__project_projectmember__role__gt=ROLE.GUEST.value),
        project__project_projectmember__member=user,
        project__project_projectmember__is_active=True,
    )


def apply_board_filters(
    queryset,
    request,
    view=None,
    extra_filters=None,
    prefix="",
    saved_view_filters=None,
):
    """Apply one compiled filter tree, then hierarchy / extra kwargs.

    Rich JSON (`filters` / saved `view_id`) is the single stack when present.
    Legacy flat GET params run only when no rich tree exists.
    """
    request_tree = _parse_request_filter_tree(request)
    filter_tree = _merge_filter_trees(saved_view_filters, request_tree)

    if filter_tree:
        filter_view = view if view is not None else type("BoardFilterView", (), {})()
        queryset = IssueComplexFilterBackend().filter_queryset(
            request, queryset, filter_view, filter_data=filter_tree
        )
        filters = {}
    else:
        if view is not None:
            queryset = view.filter_queryset(queryset)
        filters = issue_filters(request.query_params, "GET", prefix=prefix)
        queryset = apply_issue_filters(
            queryset,
            filters,
            extra_filters=None,
            query_params=None,
            prefix=prefix,
        )

    queryset = apply_issue_filters(
        queryset,
        {},
        extra_filters,
        query_params=request.query_params,
        prefix=prefix,
    )
    return queryset, filters


def annotate_intake_issue_relations(queryset):
    """Label / assignee ids on IntakeIssue rows for the intake serializer."""
    return queryset.annotate(
        label_ids=Coalesce(
            ArrayAgg(
                "issue__labels__id",
                distinct=True,
                filter=Q(~Q(issue__labels__id__isnull=True) & Q(issue__label_issue__deleted_at__isnull=True)),
            ),
            Value([], output_field=ArrayField(UUIDField())),
        ),
        assignee_ids=Coalesce(
            ArrayAgg(
                "issue__assignees__id",
                distinct=True,
                filter=Q(
                    ~Q(issue__assignees__id__isnull=True)
                    & Q(issue__assignees__member_project__is_active=True)
                    & Q(issue__issue_assignee__deleted_at__isnull=True)
                ),
            ),
            Value([], output_field=ArrayField(UUIDField())),
        ),
    )


def wants_property_values(request):
    expand = request.GET.get("expand") or ""
    if not expand:
        return False
    return "property_values" in {part.strip() for part in expand.split(",") if part.strip()}


def attach_property_values(rows, project_id=None):
    if not rows:
        return rows
    issue_ids = [row.get("id") for row in rows if row.get("id")]
    values_map = get_issues_property_values_maps(issue_ids, project_id)
    for row in rows:
        row["property_values"] = values_map.get(str(row.get("id")), {})
    return rows


def serialize_issue_board_row(issue_id, user_timezone=None, project_id=None, expand_property_values=False):
    queryset = annotate_issue_board_qs(Issue.objects.filter(pk=issue_id))
    queryset = issue_queryset_grouper(queryset=queryset, group_by=None, sub_group_by=None)
    rows = issue_on_results(issues=queryset, group_by=None, sub_group_by=None)
    if not rows:
        return None
    row = rows[0]
    if user_timezone:
        row = user_timezone_converter(row, ["created_at", "updated_at"], user_timezone)
    if expand_property_values:
        attach_property_values([row], project_id=project_id)
    return row


def paginate_issue_board(
    view,
    request,
    *,
    slug,
    project_id,
    issue_queryset,
    filters,
    order_by_param,
    group_by,
    sub_group_by,
    filtered_issue_queryset=None,
    count_filter=None,
    on_results=None,
    group_values_fn=None,
):
    if group_by and sub_group_by and group_by == sub_group_by:
        raise InvalidBoardGrouping("Group by and sub group by cannot have same parameters")

    if filtered_issue_queryset is None:
        filtered_issue_queryset = issue_queryset
    if on_results is None:
        include_properties = wants_property_values(request)

        def default_on_results(issues):
            rows = issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by)
            if include_properties:
                return attach_property_values(rows, project_id=project_id)
            return rows

        on_results = default_on_results

    if group_values_fn is None:
        group_values_fn = issue_group_values

    if group_by and sub_group_by:
        return view.paginate(
            request=request,
            order_by=order_by_param,
            queryset=issue_queryset,
            total_count_queryset=filtered_issue_queryset,
            on_results=on_results,
            paginator_cls=SubGroupedOffsetPaginator,
            group_by_fields=group_values_fn(
                field=group_by,
                slug=slug,
                project_id=project_id,
                filters=filters,
                queryset=filtered_issue_queryset,
            ),
            sub_group_by_fields=group_values_fn(
                field=sub_group_by,
                slug=slug,
                project_id=project_id,
                filters=filters,
                queryset=filtered_issue_queryset,
            ),
            group_by_field_name=group_by,
            sub_group_by_field_name=sub_group_by,
            count_filter=count_filter,
        )
    if group_by:
        return view.paginate(
            request=request,
            order_by=order_by_param,
            queryset=issue_queryset,
            total_count_queryset=filtered_issue_queryset,
            on_results=on_results,
            paginator_cls=GroupedOffsetPaginator,
            group_by_fields=group_values_fn(
                field=group_by,
                slug=slug,
                project_id=project_id,
                filters=filters,
                queryset=filtered_issue_queryset,
            ),
            group_by_field_name=group_by,
            count_filter=count_filter,
        )
    return view.paginate(
        order_by=order_by_param,
        request=request,
        queryset=issue_queryset,
        total_count_queryset=filtered_issue_queryset,
        on_results=on_results,
    )


def prepare_issue_board(
    view,
    request,
    *,
    queryset,
    extra_filters=None,
    restrict_guest=False,
    project=None,
    user=None,
    default_order_by="-created_at",
    prefetch=None,
    grouper_fn=None,
    slug=None,
    project_id=None,
    saved_view_filters=None,
):
    extra = dict(extra_filters or {})
    if request.GET.get("updated_at__gt") is not None:
        extra["updated_at__gt"] = request.GET.get("updated_at__gt")

    if saved_view_filters is None and slug:
        saved_view_filters = resolve_saved_view_filters(request, slug=slug, project_id=project_id)

    issue_queryset, filters = apply_board_filters(
        queryset,
        request,
        view=view,
        extra_filters=extra or None,
        saved_view_filters=saved_view_filters,
    )
    if restrict_guest:
        issue_queryset = restrict_guest_issues(
            issue_queryset,
            slug=slug,
            project_id=project_id,
            user=user or request.user,
            project=project,
        )
    filtered_issue_queryset = issue_queryset.all()
    issue_queryset = annotate_issue_board_qs(issue_queryset)
    if prefetch:
        issue_queryset = issue_queryset.prefetch_related(*prefetch)

    order_by_param = request.GET.get("order_by", default_order_by)
    issue_queryset, order_by_param = order_issue_queryset(
        issue_queryset=issue_queryset, order_by_param=order_by_param
    )
    group_by = parse_group_param(request.GET.get("group_by"))
    sub_group_by = parse_group_param(request.GET.get("sub_group_by"))
    grouper = grouper_fn or issue_queryset_grouper
    issue_queryset = grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)
    return PreparedIssueBoard(
        issue_queryset=issue_queryset,
        filtered_issue_queryset=filtered_issue_queryset,
        filters=filters,
        order_by_param=order_by_param,
        group_by=group_by,
        sub_group_by=sub_group_by,
    )


def list_issue_board(
    view,
    request,
    *,
    slug,
    project_id,
    queryset,
    extra_filters=None,
    restrict_guest=False,
    project=None,
    user=None,
    default_order_by="-created_at",
    prefetch=None,
    count_filter=None,
    on_results=None,
    group_values_fn=None,
    grouper_fn=None,
):
    """Filter, annotate, group, and paginate a board-scoped issue queryset."""
    try:
        saved_view_filters = resolve_saved_view_filters(request, slug=slug, project_id=project_id)
    except SavedViewNotFound as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    prepared = prepare_issue_board(
        view,
        request,
        queryset=queryset,
        extra_filters=extra_filters,
        restrict_guest=restrict_guest,
        project=project,
        user=user,
        default_order_by=default_order_by,
        prefetch=prefetch,
        grouper_fn=grouper_fn,
        slug=slug,
        project_id=project_id,
        saved_view_filters=saved_view_filters,
    )
    try:
        return paginate_issue_board(
            view,
            request,
            slug=slug,
            project_id=project_id,
            issue_queryset=prepared.issue_queryset,
            filters=prepared.filters,
            order_by_param=prepared.order_by_param,
            group_by=prepared.group_by,
            sub_group_by=prepared.sub_group_by,
            filtered_issue_queryset=prepared.filtered_issue_queryset,
            count_filter=count_filter,
            on_results=on_results,
            group_values_fn=group_values_fn,
        )
    except InvalidBoardGrouping as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
