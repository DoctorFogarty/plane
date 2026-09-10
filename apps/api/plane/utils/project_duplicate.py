# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Setup-only project duplication helpers.

Copies project configuration (settings, workflow, labels, estimates, issue types,
custom properties/options, views, intake shells, members) into a new project with
a new name and identifier. Does not copy work-item content.
"""

from __future__ import annotations

import copy
import logging
import uuid
from typing import Any, Dict, List, Optional, Set, Union

from django.db import transaction

from plane.db.models import (
    Estimate,
    EstimatePoint,
    Intake,
    IssueProperty,
    IssuePropertyOption,
    IssueView,
    Label,
    Project,
    ProjectIdentifier,
    ProjectIssueType,
    ProjectMember,
    ProjectStateGroup,
    State,
)
from plane.db.models.project import ROLE
from plane.utils.filters.custom_property import CUSTOM_PROPERTY_FILTER_RE

logger = logging.getLogger("plane.worker")

CONTENT_FILTER_KEYS = {
    "cycle",
    "module",
    "cycle_id",
    "module_id",
    "cycles",
    "modules",
}

LEGACY_UUID_LIST_KEYS = {"state", "labels"}


def _as_str(value: Any) -> str:
    return str(value)


def _remap_uuid_value(
    value: Any,
    id_map: Dict[str, str],
) -> Any:
    """Remap a single UUID (string/UUID) or list/tuple of UUIDs using id_map."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        remapped = []
        for item in value:
            key = _as_str(item)
            if key in id_map:
                remapped.append(id_map[key])
            elif key == "null" or item is None:
                remapped.append(item)
            else:
                # Drop unknown project-scoped IDs (e.g. cycles/modules not copied)
                continue
        return remapped
    key = _as_str(value)
    if key in id_map:
        return id_map[key]
    return value


def _should_drop_filter_key(key: str) -> bool:
    base = key.split("__", 1)[0]
    return base in CONTENT_FILTER_KEYS


def _remap_filter_leaf(
    key: str,
    value: Any,
    *,
    style: str,
    state_map: Dict[str, str],
    label_map: Dict[str, str],
    property_map: Dict[str, str],
    option_map: Dict[str, str],
) -> Optional[tuple[str, Any]]:
    if _should_drop_filter_key(key):
        return None

    custom_match = CUSTOM_PROPERTY_FILTER_RE.match(key)
    if custom_match:
        old_property_id = custom_match.group("property_id")
        lookup = custom_match.group("lookup")
        new_property_id = property_map.get(old_property_id)
        if not new_property_id:
            return None
        return f"customproperty_{new_property_id}__{lookup}", _remap_uuid_value(value, option_map)

    if style == "legacy":
        if key in LEGACY_UUID_LIST_KEYS:
            id_map = state_map if key == "state" else label_map
            return key, _remap_uuid_value(value, id_map)
        return key, copy.deepcopy(value)

    base = key.split("__", 1)[0]
    if base == "state_id":
        return key, _remap_uuid_value(value, state_map)
    if base == "label_id":
        return key, _remap_uuid_value(value, label_map)
    if base in ("cycle_id", "module_id"):
        return None
    return key, copy.deepcopy(value)


def remap_filter_tree(
    node: Any,
    *,
    style: str,
    state_map: Dict[str, str],
    label_map: Dict[str, str],
    property_map: Dict[str, str],
    option_map: Dict[str, str],
) -> Any:
    """Walk a legacy or rich filter tree and remap project-scoped IDs."""
    if node is None:
        return {} if style == "legacy" else {}

    if isinstance(node, list):
        remapped_list = []
        for item in node:
            remapped_item = remap_filter_tree(
                item,
                style=style,
                state_map=state_map,
                label_map=label_map,
                property_map=property_map,
                option_map=option_map,
            )
            if remapped_item in ({}, [], None):
                continue
            remapped_list.append(remapped_item)
        return remapped_list

    if not isinstance(node, dict):
        return node

    if "and" in node or "or" in node:
        remapped: Dict[str, Any] = {}
        for bool_key in ("and", "or"):
            if bool_key in node:
                remapped[bool_key] = remap_filter_tree(
                    node[bool_key],
                    style=style,
                    state_map=state_map,
                    label_map=label_map,
                    property_map=property_map,
                    option_map=option_map,
                )
        return remapped

    result: Dict[str, Any] = {}
    for key, value in node.items():
        remapped = _remap_filter_leaf(
            key,
            value,
            style=style,
            state_map=state_map,
            label_map=label_map,
            property_map=property_map,
            option_map=option_map,
        )
        if remapped is None:
            continue
        result[remapped[0]] = remapped[1]
    return result


def remap_filters(
    filters: Optional[Dict[str, Any]],
    *,
    state_map: Dict[str, str],
    label_map: Dict[str, str],
    property_map: Dict[str, str],
    option_map: Dict[str, str],
) -> Dict[str, Any]:
    """Remap legacy `filters` JSON for a duplicated project."""
    if not filters:
        return {}
    return remap_filter_tree(
        filters,
        style="legacy",
        state_map=state_map,
        label_map=label_map,
        property_map=property_map,
        option_map=option_map,
    )


def remap_rich_filters(
    rich_filters: Optional[Union[Dict[str, Any], List[Any]]],
    *,
    state_map: Dict[str, str],
    label_map: Dict[str, str],
    property_map: Dict[str, str],
    option_map: Dict[str, str],
) -> Any:
    """Recursively remap `rich_filters` JSON (flat or nested and/or trees)."""
    if rich_filters is None:
        return {}
    return remap_filter_tree(
        rich_filters,
        style="rich",
        state_map=state_map,
        label_map=label_map,
        property_map=property_map,
        option_map=option_map,
    )


def _clone_state_groups_and_states(
    source: Project,
    target: Project,
    actor_id: uuid.UUID,
) -> Dict[str, str]:
    """Copy workflow groups and states. Returns old_state_id -> new_state_id."""
    group_map: Dict[str, str] = {}
    state_map: Dict[str, str] = {}

    source_groups = list(ProjectStateGroup.all_objects.filter(project=source).order_by("sequence"))
    new_groups: List[ProjectStateGroup] = []
    for group in source_groups:
        new_id = uuid.uuid4()
        group_map[_as_str(group.id)] = _as_str(new_id)
        new_groups.append(
            ProjectStateGroup(
                id=new_id,
                name=group.name,
                description=group.description,
                color=group.color,
                slug=group.slug,
                sequence=group.sequence,
                category=group.category,
                is_system=group.is_system,
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
        )
    if new_groups:
        ProjectStateGroup.all_objects.bulk_create(new_groups)

    source_states = list(State.all_state_objects.filter(project=source).order_by("sequence"))
    new_states: List[State] = []
    for state in source_states:
        new_id = uuid.uuid4()
        state_map[_as_str(state.id)] = _as_str(new_id)
        workflow_group_id = None
        if state.workflow_group_id:
            workflow_group_id = group_map.get(_as_str(state.workflow_group_id))
        new_states.append(
            State(
                id=new_id,
                name=state.name,
                description=state.description,
                color=state.color,
                slug=state.slug,
                sequence=state.sequence,
                group=state.group,
                workflow_group_id=workflow_group_id,
                is_triage=state.is_triage,
                default=state.default,
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
        )
    if new_states:
        State.all_state_objects.bulk_create(new_states)

    if source.default_state_id:
        new_default = state_map.get(_as_str(source.default_state_id))
        if new_default:
            target.default_state_id = new_default
            target.save(update_fields=["default_state_id"])

    return state_map


def _clone_labels(source: Project, target: Project, actor_id: uuid.UUID) -> Dict[str, str]:
    label_map: Dict[str, str] = {}
    source_labels = list(Label.objects.filter(project=source).order_by("sort_order", "created_at"))
    new_labels: List[Label] = []
    for label in source_labels:
        new_id = uuid.uuid4()
        label_map[_as_str(label.id)] = _as_str(new_id)
        new_labels.append(
            Label(
                id=new_id,
                name=label.name,
                description=label.description,
                color=label.color,
                sort_order=label.sort_order,
                parent=None,
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
        )
    if new_labels:
        Label.objects.bulk_create(new_labels)

    # Second pass: remap parent relationships
    for label in source_labels:
        if not label.parent_id:
            continue
        new_label_id = label_map.get(_as_str(label.id))
        new_parent_id = label_map.get(_as_str(label.parent_id))
        if new_label_id and new_parent_id:
            Label.objects.filter(id=new_label_id).update(parent_id=new_parent_id)

    return label_map


def _clone_estimates(source: Project, target: Project, actor_id: uuid.UUID) -> Dict[str, str]:
    estimate_map: Dict[str, str] = {}
    source_estimates = list(Estimate.objects.filter(project=source))
    for estimate in source_estimates:
        new_estimate = Estimate.objects.create(
            name=estimate.name,
            description=estimate.description,
            type=estimate.type,
            last_used=estimate.last_used,
            project=target,
            workspace=target.workspace,
            created_by_id=actor_id,
        )
        estimate_map[_as_str(estimate.id)] = _as_str(new_estimate.id)

        points = list(EstimatePoint.objects.filter(estimate=estimate, project=source))
        EstimatePoint.objects.bulk_create(
            [
                EstimatePoint(
                    id=uuid.uuid4(),
                    estimate=new_estimate,
                    key=point.key,
                    description=point.description,
                    value=point.value,
                    project=target,
                    workspace=target.workspace,
                    created_by_id=actor_id,
                )
                for point in points
            ]
        )

    if source.estimate_id:
        new_estimate_id = estimate_map.get(_as_str(source.estimate_id))
        if new_estimate_id:
            target.estimate_id = new_estimate_id
            target.save(update_fields=["estimate_id"])

    return estimate_map


def _clone_issue_types_and_properties(
    source: Project,
    target: Project,
    actor_id: uuid.UUID,
) -> tuple[Dict[str, str], Dict[str, str]]:
    """Reuse workspace IssueTypes; copy ProjectIssueType links and properties/options."""
    property_map: Dict[str, str] = {}
    option_map: Dict[str, str] = {}

    source_links = list(ProjectIssueType.objects.filter(project=source))
    ProjectIssueType.objects.bulk_create(
        [
            ProjectIssueType(
                id=uuid.uuid4(),
                issue_type_id=link.issue_type_id,
                level=link.level,
                is_default=link.is_default,
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
            for link in source_links
        ]
    )

    source_properties = list(IssueProperty.objects.filter(project=source).order_by("sort_order", "created_at"))
    new_properties: List[IssueProperty] = []
    for prop in source_properties:
        new_id = uuid.uuid4()
        property_map[_as_str(prop.id)] = _as_str(new_id)
        new_properties.append(
            IssueProperty(
                id=new_id,
                issue_type_id=prop.issue_type_id,
                name=prop.name,
                description=prop.description,
                property_type=prop.property_type,
                is_required=prop.is_required,
                is_active=prop.is_active,
                sort_order=prop.sort_order,
                settings=copy.deepcopy(prop.settings or {}),
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
        )
    if new_properties:
        IssueProperty.objects.bulk_create(new_properties)

    source_options = list(IssuePropertyOption.objects.filter(project=source).order_by("sort_order", "created_at"))
    new_options: List[IssuePropertyOption] = []
    for option in source_options:
        new_property_id = property_map.get(_as_str(option.property_id))
        if not new_property_id:
            continue
        new_id = uuid.uuid4()
        option_map[_as_str(option.id)] = _as_str(new_id)
        new_options.append(
            IssuePropertyOption(
                id=new_id,
                property_id=new_property_id,
                name=option.name,
                description=option.description,
                logo_props=copy.deepcopy(option.logo_props or {}),
                sort_order=option.sort_order,
                is_default=option.is_default,
                is_active=option.is_active,
                project=target,
                workspace=target.workspace,
                created_by_id=actor_id,
            )
        )
    if new_options:
        IssuePropertyOption.objects.bulk_create(new_options)

    return property_map, option_map


def _clone_views(
    source: Project,
    target: Project,
    actor_id: uuid.UUID,
    *,
    state_map: Dict[str, str],
    label_map: Dict[str, str],
    property_map: Dict[str, str],
    option_map: Dict[str, str],
    member_ids: Set[str],
) -> None:
    source_views = list(IssueView.objects.filter(project=source, archived_at__isnull=True))
    for view in source_views:
        owned_by_id = view.owned_by_id
        if owned_by_id and _as_str(owned_by_id) not in member_ids:
            owned_by_id = actor_id

        IssueView.objects.create(
            name=view.name,
            description=view.description,
            filters=remap_filters(
                view.filters,
                state_map=state_map,
                label_map=label_map,
                property_map=property_map,
                option_map=option_map,
            ),
            display_filters=copy.deepcopy(view.display_filters or {}),
            display_properties=copy.deepcopy(view.display_properties or {}),
            rich_filters=remap_rich_filters(
                view.rich_filters,
                state_map=state_map,
                label_map=label_map,
                property_map=property_map,
                option_map=option_map,
            ),
            access=view.access,
            sort_order=view.sort_order,
            logo_props=copy.deepcopy(view.logo_props or {}),
            owned_by_id=owned_by_id,
            is_locked=view.is_locked,
            project=target,
            workspace=target.workspace,
            created_by_id=actor_id,
        )


def _clone_intake(source: Project, target: Project, actor_id: uuid.UUID) -> None:
    if not target.intake_view:
        return

    source_intakes = list(Intake.objects.filter(project=source))
    if not source_intakes:
        Intake.objects.create(
            name=f"{target.name} Intake",
            project=target,
            workspace=target.workspace,
            is_default=True,
            created_by_id=actor_id,
        )
        return

    for intake in source_intakes:
        Intake.objects.create(
            name=intake.name,
            description=intake.description,
            is_default=intake.is_default,
            view_props=copy.deepcopy(intake.view_props or {}),
            logo_props=copy.deepcopy(intake.logo_props or {}),
            project=target,
            workspace=target.workspace,
            created_by_id=actor_id,
        )


def _clone_members(source: Project, target: Project, actor_id: uuid.UUID) -> Set[str]:
    """Copy active members. ProjectMember.save creates fresh ProjectUserProperty."""
    member_ids: Set[str] = set()
    source_members = list(
        ProjectMember.objects.filter(project=source, is_active=True).select_related("member")
    )

    # Ensure actor is always an admin on the new project
    actor_already_member = False
    for member in source_members:
        if not member.member_id:
            continue
        role = member.role
        if _as_str(member.member_id) == _as_str(actor_id):
            role = max(role, ROLE.ADMIN.value)
            actor_already_member = True
        ProjectMember.objects.create(
            project=target,
            workspace=target.workspace,
            member_id=member.member_id,
            role=role,
            comment=member.comment,
            preferences=copy.deepcopy(member.preferences or {}),
            is_active=True,
            created_by_id=actor_id,
        )
        member_ids.add(_as_str(member.member_id))

    if not actor_already_member:
        ProjectMember.objects.create(
            project=target,
            workspace=target.workspace,
            member_id=actor_id,
            role=ROLE.ADMIN.value,
            is_active=True,
            created_by_id=actor_id,
        )
        member_ids.add(_as_str(actor_id))

    return member_ids


def _create_target_project(
    source: Project,
    *,
    name: str,
    identifier: str,
    actor_id: uuid.UUID,
) -> Project:
    # Remap lead/assignee only if they are active members of the source project
    active_member_ids = set(
        ProjectMember.objects.filter(project=source, is_active=True).values_list("member_id", flat=True)
    )
    active_member_ids = {_as_str(mid) for mid in active_member_ids if mid}

    project_lead_id = source.project_lead_id
    if project_lead_id and _as_str(project_lead_id) not in active_member_ids:
        project_lead_id = None

    default_assignee_id = source.default_assignee_id
    if default_assignee_id and _as_str(default_assignee_id) not in active_member_ids:
        default_assignee_id = None

    target = Project(
        name=name,
        identifier=identifier,
        description=source.description,
        description_text=copy.deepcopy(source.description_text),
        description_html=copy.deepcopy(source.description_html),
        network=source.network,
        workspace=source.workspace,
        default_assignee_id=default_assignee_id,
        project_lead_id=project_lead_id,
        emoji=source.emoji,
        icon_prop=copy.deepcopy(source.icon_prop),
        module_view=source.module_view,
        cycle_view=source.cycle_view,
        issue_views_view=source.issue_views_view,
        page_view=source.page_view,
        intake_view=source.intake_view,
        is_time_tracking_enabled=source.is_time_tracking_enabled,
        is_issue_type_enabled=source.is_issue_type_enabled,
        guest_view_all_features=source.guest_view_all_features,
        cover_image=source.cover_image,
        cover_image_asset_id=source.cover_image_asset_id,
        archive_in=source.archive_in,
        close_in=source.close_in,
        logo_props=copy.deepcopy(source.logo_props or {}),
        timezone=source.timezone,
        archived_at=None,
        external_source=None,
        external_id=None,
        # estimate and default_state remapped after clone
        estimate=None,
        default_state=None,
    )
    target.is_timezone_provided = True
    target.save(created_by_id=actor_id, disable_auto_set_user=True)

    ProjectIdentifier.objects.create(
        name=target.identifier,
        project=target,
        workspace_id=target.workspace_id,
    )
    return target


@transaction.atomic
def duplicate_project_setup(
    *,
    source_project_id: uuid.UUID,
    workspace_slug: str,
    name: str,
    identifier: str,
    actor_id: uuid.UUID,
) -> Project:
    """
    Create a new project by cloning setup/configuration from an existing project.

    Returns the newly created Project instance.
    """
    source = Project.objects.select_related("workspace").get(
        id=source_project_id,
        workspace__slug=workspace_slug,
    )

    target = _create_target_project(
        source,
        name=name,
        identifier=identifier,
        actor_id=actor_id,
    )

    state_map = _clone_state_groups_and_states(source, target, actor_id)
    label_map = _clone_labels(source, target, actor_id)
    _clone_estimates(source, target, actor_id)
    property_map, option_map = _clone_issue_types_and_properties(source, target, actor_id)
    member_ids = _clone_members(source, target, actor_id)
    _clone_views(
        source,
        target,
        actor_id,
        state_map=state_map,
        label_map=label_map,
        property_map=property_map,
        option_map=option_map,
        member_ids=member_ids,
    )
    _clone_intake(source, target, actor_id)

    logger.info(
        "Duplicated project setup source=%s target=%s actor=%s",
        source.id,
        target.id,
        actor_id,
    )
    return target
