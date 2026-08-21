# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
import logging
import re
from uuid import UUID

from django.utils import timezone
from slack_sdk.errors import SlackApiError

from plane.app.permissions import ROLE
from plane.db.models import (
    Cycle,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueSubscriber,
    IssueType,
    Label,
    Module,
    Page,
    Project,
    ProjectMember,
    SlackAuditLog,
    SlackChannelSubscription,
    SlackEventIdempotency,
    SlackThreadLink,
    SlackUserConnection,
    SlackWorkspaceConnection,
    State,
    UserNotificationPreference,
    WorkspaceInviteLink,
    WorkspaceMember,
)
from plane.utils.issue_property import apply_value_to_model
from plane.utils.issue_assignees import live_assignee_ids
from plane.utils.slack.blocks import (
    connect_gate_blocks,
    create_issue_modal,
    issue_card_blocks,
    link_thread_modal,
    manage_channel_modal,
    project_select_modal,
    slack_option,
    truncate_option,
)
from plane.utils.slack.channels import post_link_unfurls, resolve_slack_channel
from plane.utils.slack.filters import DEFAULT_CHANNEL_EVENTS
from plane.utils.slack.runtime import (
    add_comment,
    can_get_issue,
    create_intake_issue_from_slack,
    create_issue_from_slack,
    emit_issue_updated,
    ingest_slack_thread_reply,
    is_project_member,
    mapped_user,
    post_ephemeral,
    workspace_connection_for_team,
)
from plane.utils.slack.slash import parse_slash_create_args, should_open_create_modal, workspace_type_names
from plane.utils.slack.tokens import bot_client, redact_tokens
from plane.utils.slack.urls import extract_uppercase_identifiers, parse_plane_url, public_origin, work_item_url

logger = logging.getLogger("plane.slack")

LINK_THREAD_CALLBACKS = {"link_work_item", "link_thread"}
INTAKE_CALLBACKS = {"create_intake_issue", "intake_shortcut"}


def claim_event(event_id: str | None) -> bool:
    if not event_id:
        return True
    _, created = SlackEventIdempotency.objects.get_or_create(event_id=str(event_id)[:128])
    return created


def connect_url(slug: str) -> str:
    return f"{public_origin()}/api/workspaces/{slug}/integrations/slack/connect-user/"


def issue_url(issue: Issue) -> str:
    return work_item_url(issue.workspace.slug, issue.project.identifier, issue.sequence_id)


def invite_url(link: WorkspaceInviteLink) -> str:
    return f"{public_origin()}/workspace-join/?slug={link.workspace.slug}&code={link.anchor}"


def member_projects(connection: SlackWorkspaceConnection, user):
    return Project.objects.filter(
        project_projectmember__member=user,
        project_projectmember__is_active=True,
        workspace=connection.workspace,
    ).distinct()


def required_property_blocks(project) -> list[dict]:
    properties = IssueProperty.objects.filter(project=project, is_required=True, is_active=True).order_by("sort_order")[
        :8
    ]
    blocks = []
    for prop in properties:
        block_id = f"prop:{prop.id}"
        if prop.property_type == "DROPDOWN":
            options = [
                slack_option(str(opt.id), opt.name)
                for opt in IssuePropertyOption.objects.filter(property=prop)[:100]
            ]
            if not options:
                continue
            blocks.append(
                {
                    "type": "input",
                    "block_id": block_id,
                    "label": {"type": "plain_text", "text": truncate_option(prop.name)},
                    "element": {"type": "static_select", "action_id": "value", "options": options},
                }
            )
        else:
            blocks.append(
                {
                    "type": "input",
                    "block_id": block_id,
                    "label": {"type": "plain_text", "text": truncate_option(prop.name)},
                    "element": {"type": "plain_text_input", "action_id": "value"},
                }
            )
    return blocks


def _project_role(user, project_id) -> int:
    membership = ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True).first()
    return membership.role if membership else 0


def project_issue_types(project):
    return list(
        IssueType.objects.filter(
            workspace=project.workspace,
            is_active=True,
            is_epic=False,
            project_issue_types__project=project,
        ).distinct()[:100]
    )


def match_issue_type(types: list, hint: str):
    if not hint:
        return None
    lowered = hint.lower()
    return next((item for item in types if (item.name or "").lower() == lowered), None)


def open_create_modal(
    connection, user, trigger_id, channel_id, *, prefill: str = "", intake: bool = False, type_hint: str = ""
):
    projects = list(member_projects(connection, user)[:100])
    if not projects:
        return False
    options = [slack_option(str(p.id), f"{p.identifier} {p.name}") for p in projects]
    metadata = json.dumps(
        {
            "channel_id": channel_id,
            "user_id": str(user.id),
            "prefill": prefill[:200],
            "intake": intake,
            "type_hint": type_hint[:80],
        }
    )
    bot_client(connection).views_open(trigger_id=trigger_id, view=project_select_modal(options, metadata))
    return True


def open_link_thread_modal(connection, user, trigger_id, channel_id, thread_ts, *, initial_key: str = ""):
    metadata = json.dumps(
        {
            "channel_id": channel_id,
            "thread_ts": thread_ts,
            "user_id": str(user.id),
        }
    )
    bot_client(connection).views_open(
        trigger_id=trigger_id, view=link_thread_modal(metadata, initial_key=initial_key)
    )
    return True


def _manage_modal_blocks(connection, user, channel_id) -> tuple[list[dict], bool]:
    subs = list(
        SlackChannelSubscription.objects.filter(workspace_connection=connection, channel_id=channel_id).select_related(
            "project"
        )
    )
    blocks: list[dict] = []
    if not subs:
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "No project subscriptions in this channel yet.",
                },
            }
        )
    for sub in subs[:10]:
        role = _project_role(user, sub.project_id)
        status = "paused" if sub.is_paused else "active"
        section: dict = {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{sub.project.identifier}* {sub.project.name} · {status}"},
        }
        options = []
        if role >= ROLE.MEMBER.value:
            options.append(
                {
                    "text": {"type": "plain_text", "text": "Resume" if sub.is_paused else "Pause"},
                    "value": f"{'resume' if sub.is_paused else 'pause'}:{sub.id}",
                }
            )
        if role >= ROLE.ADMIN.value:
            options.append({"text": {"type": "plain_text", "text": "Disconnect"}, "value": f"disconnect:{sub.id}"})
        if options:
            section["accessory"] = {"type": "overflow", "action_id": "manage_subscription", "options": options}
        blocks.append(section)

    subscribed_ids = {sub.project_id for sub in subs}
    addable = [
        project
        for project in member_projects(connection, user)
        if project.id not in subscribed_ids and _project_role(user, project.id) >= ROLE.ADMIN.value
    ]
    can_add = bool(addable)
    if can_add:
        blocks.append(
            {
                "type": "input",
                "optional": True,
                "block_id": "project",
                "label": {"type": "plain_text", "text": "Add a project"},
                "element": {
                    "type": "static_select",
                    "action_id": "project",
                    "options": [slack_option(str(p.id), f"{p.identifier} {p.name}") for p in addable[:100]],
                },
            }
        )
        blocks.append(
            {
                "type": "input",
                "optional": True,
                "block_id": "public_ack",
                "label": {"type": "plain_text", "text": "Secret projects"},
                "element": {
                    "type": "checkboxes",
                    "action_id": "public_ack",
                    "options": [
                        {
                            "text": {
                                "type": "plain_text",
                                "text": "Allow posting a secret project to this public channel",
                            },
                            "value": "1",
                        }
                    ],
                },
            }
        )
    return blocks, can_add


def open_manage_modal(connection, user, trigger_id, channel_id) -> bool:
    blocks, can_add = _manage_modal_blocks(connection, user, channel_id)
    metadata = json.dumps({"channel_id": channel_id, "user_id": str(user.id)})
    bot_client(connection).views_open(
        trigger_id=trigger_id,
        view=manage_channel_modal(blocks, metadata, submit="Add" if can_add else "Done"),
    )
    return True


def _refresh_manage_modal(connection, user, view_id, channel_id) -> None:
    if not view_id:
        return
    blocks, can_add = _manage_modal_blocks(connection, user, channel_id)
    metadata = json.dumps({"channel_id": channel_id, "user_id": str(user.id)})
    bot_client(connection).views_update(
        view_id=view_id,
        view=manage_channel_modal(blocks, metadata, submit="Add" if can_add else "Done"),
    )


def issue_for_identifier(connection, project_identifier: str, sequence_id: int):
    project = Project.objects.filter(workspace=connection.workspace, identifier__iexact=project_identifier).first()
    if not project:
        return None
    return (
        Issue.objects.filter(project=project, sequence_id=sequence_id)
        .select_related("project", "state", "workspace")
        .prefetch_related("assignees")
        .first()
    )


def handle_slash(connection, payload: dict) -> None:
    user_id = payload.get("user_id")
    channel_id = payload.get("channel_id")
    trigger_id = payload.get("trigger_id")
    text = (payload.get("text") or "").strip()
    user = mapped_user(connection, user_id)
    if not user:
        post_ephemeral(
            connection,
            channel_id,
            user_id,
            "Connect your Plane account to continue.",
            connect_gate_blocks(connect_url(connection.workspace.slug)),
        )
        return

    command = (text.split() or [""])[0].lower()
    if command == "help":
        post_ephemeral(
            connection,
            channel_id,
            user_id,
            "Commands: /plane help | create [type] [summary] | connect | manage | notify | KEY | invite | logout | unsubscribe",
        )
        return
    if command == "notify":
        pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
        pref.slack_dm = not pref.slack_dm
        pref.save(update_fields=["slack_dm"])
        post_ephemeral(connection, channel_id, user_id, f"Slack DMs are now {'on' if pref.slack_dm else 'off'}.")
        return
    if command == "logout":
        SlackUserConnection.objects.filter(workspace_connection=connection, user=user).delete()
        post_ephemeral(connection, channel_id, user_id, "Disconnected your Slack account from Plane.")
        return
    if command == "unsubscribe":
        SlackChannelSubscription.objects.filter(workspace_connection=connection, channel_id=channel_id).update(
            is_paused=True
        )
        SlackAuditLog.objects.create(
            workspace=connection.workspace,
            actor=user,
            action="slack.subscription.paused",
            metadata={"channel_id": channel_id},
        )
        post_ephemeral(connection, channel_id, user_id, "Paused channel subscriptions in this channel.")
        return
    if command in {"manage", "connect"}:
        if trigger_id:
            open_manage_modal(connection, user, trigger_id, channel_id)
        else:
            _slash_manage_fallback(connection, user, channel_id, user_id)
        return
    if command == "invite":
        _slash_invite(connection, user, channel_id, user_id)
        return
    keys = extract_uppercase_identifiers(text)
    if keys and command != "create":
        _ephemeral_key_lookup(connection, user, channel_id, user_id, keys[0])
        return
    if trigger_id:
        type_hint, summary = parse_slash_create_args(text, workspace_type_names(connection))
        open_create_modal(connection, user, trigger_id, channel_id, prefill=summary, type_hint=type_hint)
        return
    post_ephemeral(connection, channel_id, user_id, "Use /plane create to open the work item modal.")


def _slash_manage_fallback(connection, user, channel_id, user_id):
    subs = SlackChannelSubscription.objects.filter(workspace_connection=connection, channel_id=channel_id)
    if not subs.exists():
        post_ephemeral(
            connection,
            channel_id,
            user_id,
            "No project subscriptions in this channel. Use /plane manage to add a project.",
        )
        return
    lines = []
    for sub in subs.select_related("project"):
        paused = "paused" if sub.is_paused else "active"
        lines.append(f"• {sub.project.identifier} ({paused})")
    post_ephemeral(
        connection,
        channel_id,
        user_id,
        "Subscriptions:\n" + "\n".join(lines) + "\nUse /plane manage to pause, disconnect, or add.",
    )


def _slash_invite(connection, user, channel_id, user_id):
    membership = WorkspaceMember.objects.filter(
        workspace=connection.workspace, member=user, is_active=True
    ).first()
    link = WorkspaceInviteLink.objects.filter(workspace=connection.workspace, is_active=True).first()
    if membership and membership.role >= 15:
        if not link:
            link = WorkspaceInviteLink.objects.create(workspace=connection.workspace, role=15, created_by=user)
        post_ephemeral(connection, channel_id, user_id, f"Invite people with this link: {invite_url(link)}")
        SlackAuditLog.objects.create(
            workspace=connection.workspace, actor=user, action="slack.invite.shared", metadata={}
        )
        return
    post_ephemeral(
        connection,
        channel_id,
        user_id,
        "Ask a workspace admin to share a Plane invite link from workspace settings.",
    )


def _ephemeral_key_lookup(connection, user, channel_id, user_id, key: str):
    project_identifier, sequence_id = key.split("-", 1)
    issue = issue_for_identifier(connection, project_identifier, int(sequence_id))
    if not issue or not can_get_issue(user, issue):
        post_ephemeral(connection, channel_id, user_id, "No access")
        return
    post_ephemeral(
        connection,
        channel_id,
        user_id,
        f"{issue.project.identifier}-{issue.sequence_id}",
        issue_card_blocks(issue, connection.workspace.slug, issue_url(issue)),
    )


def view_submission_response(connection, payload: dict) -> dict | None:
    view = payload.get("view") or {}
    callback = view.get("callback_id")
    user_id = (payload.get("user") or {}).get("id")
    user = mapped_user(connection, user_id)
    if not user:
        return None
    values = (view.get("state") or {}).get("values") or {}
    metadata = json.loads(view.get("private_metadata") or "{}")
    if callback == "project_selection":
        project_id = values.get("project", {}).get("project", {}).get("selected_option", {}).get("value")
        project = Project.objects.filter(pk=project_id, workspace=connection.workspace).first()
        if not project or not is_project_member(user, project.id):
            return None
        states = State.objects.filter(project=project).exclude(is_triage=True)[:100]
        labels = Label.objects.filter(project=project)[:100]
        types = project_issue_types(project)
        selected_type = match_issue_type(types, metadata.get("type_hint") or "")
        meta = {**metadata, "project_id": str(project.id)}
        view_body = create_issue_modal(
            json.dumps(meta),
            [slack_option(str(s.id), s.name) for s in states],
            [slack_option(str(lb.id), lb.name) for lb in labels],
            [slack_option(str(t.id), t.name) for t in types],
            str(selected_type.id) if selected_type else None,
        )
        extra = required_property_blocks(project)
        if extra:
            view_body["blocks"] = view_body["blocks"] + extra
        if metadata.get("prefill"):
            for block in view_body["blocks"]:
                if block.get("block_id") == "title":
                    block["element"]["initial_value"] = metadata["prefill"]
        if metadata.get("intake"):
            view_body["title"] = {"type": "plain_text", "text": "New intake item"}
        return {"response_action": "update", "view": view_body}
    if callback == "link_thread":
        return _link_thread_submission(connection, user, metadata, values)
    if callback == "channel_manage":
        return _channel_manage_submission(connection, user, metadata, values)
    return None


def _link_thread_submission(connection, user, metadata: dict, values: dict) -> dict:
    raw_key = (values.get("issue_key", {}).get("issue_key", {}).get("value") or "").strip()
    keys = extract_uppercase_identifiers(raw_key)
    if not keys:
        return {"response_action": "errors", "errors": {"issue_key": "Enter a work item key like PROJ-123."}}
    project_identifier, sequence_id = keys[0].split("-", 1)
    issue = issue_for_identifier(connection, project_identifier, int(sequence_id))
    if not issue or not can_get_issue(user, issue):
        return {"response_action": "errors", "errors": {"issue_key": "No access to that work item."}}
    channel_id = metadata.get("channel_id")
    thread_ts = metadata.get("thread_ts")
    if not channel_id or not thread_ts:
        return {"response_action": "errors", "errors": {"issue_key": "Missing Slack thread context."}}
    existing = SlackThreadLink.objects.filter(channel_id=channel_id, thread_ts=thread_ts).first()
    if existing and existing.issue_id != issue.id:
        return {
            "response_action": "errors",
            "errors": {"issue_key": "This thread is already linked to another work item."},
        }
    if existing:
        existing.sync_enabled = True
        existing.issue = issue
        existing.save(update_fields=["sync_enabled", "issue", "updated_at"])
        link = existing
        created = False
    else:
        link = SlackThreadLink.objects.create(
            workspace_connection=connection,
            issue=issue,
            channel_id=channel_id,
            thread_ts=thread_ts,
            sync_enabled=True,
            created_from="link",
        )
        created = True
    if created:
        backfill_thread(connection, link)
    bot_client(connection).chat_postMessage(
        channel=channel_id,
        thread_ts=thread_ts,
        text=f"Linked {issue.project.identifier}-{issue.sequence_id}",
        blocks=issue_card_blocks(issue, connection.workspace.slug, issue_url(issue)),
    )
    SlackAuditLog.objects.create(
        workspace=connection.workspace,
        actor=user,
        action="slack.thread.linked",
        metadata={"issue_id": str(issue.id), "channel_id": channel_id},
    )
    return {"response_action": "clear"}


def _channel_manage_submission(connection, user, metadata: dict, values: dict) -> dict:
    channel_id = metadata.get("channel_id")
    project_id = (values.get("project", {}).get("project", {}).get("selected_option") or {}).get("value")
    if not channel_id or not project_id:
        return {"response_action": "clear"}
    if _project_role(user, project_id) < ROLE.ADMIN.value:
        return {"response_action": "errors", "errors": {"project": "Project admins can add subscriptions."}}
    project = Project.objects.filter(pk=project_id, workspace=connection.workspace).first()
    if not project:
        return {"response_action": "errors", "errors": {"project": "Project not found."}}
    resolved = resolve_slack_channel(connection, channel_id)
    if not resolved:
        return {
            "response_action": "errors",
            "errors": {"project": "Invite the Plane bot to this channel, then try again."},
        }
    is_private = bool(resolved.get("is_private"))
    public_ack = bool(values.get("public_ack", {}).get("public_ack", {}).get("selected_options"))
    if project.network == 0 and not is_private and not public_ack:
        return {
            "response_action": "errors",
            "errors": {"public_ack": "Secret projects require acknowledgement to post in a public channel."},
        }
    existing = SlackChannelSubscription.objects.filter(
        workspace_connection=connection, channel_id=resolved["id"], project=project, filter_hash=""
    ).first()
    if existing:
        existing.is_paused = False
        existing.public_channel_ack = existing.public_channel_ack or public_ack
        existing.save(update_fields=["is_paused", "public_channel_ack", "updated_at"])
    else:
        sub = SlackChannelSubscription(
            workspace_connection=connection,
            project=project,
            workspace=project.workspace,
            channel_id=resolved["id"],
            channel_name=resolved.get("name") or "",
            is_private_channel=is_private,
            events=list(DEFAULT_CHANNEL_EVENTS),
            public_channel_ack=public_ack,
            created_by=user,
        )
        sub.save()
        SlackAuditLog.objects.create(
            workspace=connection.workspace,
            actor=user,
            action="slack.subscription.created",
            metadata={"channel_id": resolved["id"], "project_id": str(project.id)},
        )
    blocks, can_add = _manage_modal_blocks(connection, user, resolved["id"])
    metadata_out = json.dumps({"channel_id": resolved["id"], "user_id": str(user.id)})
    return {
        "response_action": "update",
        "view": manage_channel_modal(blocks, metadata_out, submit="Add" if can_add else "Done"),
    }


def handle_issue_submission(connection, payload: dict) -> None:
    view = payload.get("view") or {}
    user_id = (payload.get("user") or {}).get("id")
    user = mapped_user(connection, user_id)
    if not user:
        return
    values = (view.get("state") or {}).get("values") or {}
    metadata = json.loads(view.get("private_metadata") or "{}")
    callback = view.get("callback_id")
    if callback == "issue_comment_submission":
        issue = Issue.objects.filter(pk=metadata.get("issue_id"), workspace=connection.workspace).first()
        text = values.get("comment", {}).get("comment", {}).get("value") or ""
        if issue and text and can_get_issue(user, issue):
            add_comment(issue=issue, user=user, text=text)
        return
    if callback != "issue_submission":
        return
    title = values.get("title", {}).get("title", {}).get("value") or "Untitled"
    description = values.get("description", {}).get("description", {}).get("value") or ""
    priority = (values.get("priority", {}).get("priority", {}).get("selected_option") or {}).get("value") or "none"
    state_id = (values.get("state", {}).get("state", {}).get("selected_option") or {}).get("value")
    project = Project.objects.filter(pk=metadata.get("project_id"), workspace=connection.workspace).first()
    if not project or not is_project_member(user, project.id):
        return
    if metadata.get("intake"):
        issue = create_intake_issue_from_slack(project=project, user=user, title=title, description=description)
    else:
        type_id = (values.get("type", {}).get("type", {}).get("selected_option") or {}).get("value")
        issue = create_issue_from_slack(
            project=project,
            user=user,
            title=title,
            description=description,
            priority=priority,
            state_id=state_id,
            type_id=type_id,
        )
    for opt in values.get("labels", {}).get("labels", {}).get("selected_options") or []:
        IssueLabel.objects.get_or_create(
            issue=issue, label_id=opt.get("value"), project=project, workspace=project.workspace
        )
    _save_custom_properties(issue, project, values, user)
    sync = bool(values.get("thread_sync", {}).get("thread_sync", {}).get("selected_options"))
    channel_id = metadata.get("channel_id")
    client = bot_client(connection)
    url = issue_url(issue)
    result = client.chat_postMessage(
        channel=channel_id,
        text=f"Created {issue.project.identifier}-{issue.sequence_id}",
        blocks=issue_card_blocks(issue, connection.workspace.slug, url),
    )
    if sync and result.get("ts"):
        link, created = SlackThreadLink.objects.get_or_create(
            channel_id=channel_id,
            thread_ts=result["ts"],
            defaults={
                "workspace_connection": connection,
                "issue": issue,
                "sync_enabled": True,
                "created_from": "create",
            },
        )
        if created:
            backfill_thread(connection, link)
    SlackAuditLog.objects.create(
        workspace=connection.workspace, actor=user, action="slack.issue.created", metadata={"issue_id": str(issue.id)}
    )


def _save_custom_properties(issue, project, values, user):
    for key, block in values.items():
        if not str(key).startswith("prop:"):
            continue
        property_id = str(key).split(":", 1)[1]
        prop = IssueProperty.objects.filter(pk=property_id, project=project).first()
        if not prop:
            continue
        inner = block.get("value") or {}
        raw = inner.get("value")
        if inner.get("selected_option"):
            raw = inner["selected_option"].get("value")
        value_obj = IssuePropertyValue(
            issue=issue,
            property=prop,
            project=project,
            workspace=project.workspace,
            created_by=user,
        )
        apply_value_to_model(prop, value_obj, raw)
        value_obj.save()


def _issue_id(value) -> str | None:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def handle_block_actions(connection, payload: dict, *, allow_trigger: bool = True) -> None:
    try:
        _handle_block_actions(connection, payload, allow_trigger=allow_trigger)
    except SlackApiError as exc:
        logger.warning("Slack block action failed: %s", redact_tokens(str(exc)))


def _handle_block_actions(connection, payload: dict, *, allow_trigger: bool = True) -> None:
    user_id = (payload.get("user") or {}).get("id")
    user = mapped_user(connection, user_id)
    actions = payload.get("actions") or []
    if not actions:
        return
    action = actions[0]
    action_id = action.get("action_id")
    if action.get("url") and not action.get("value"):
        return
    view = payload.get("view") or {}
    metadata = json.loads(view.get("private_metadata") or "{}") if view else {}
    channel_id = (payload.get("channel") or {}).get("id") or metadata.get("channel_id")
    trigger_id = payload.get("trigger_id")
    if not user:
        if channel_id:
            post_ephemeral(
                connection,
                channel_id,
                user_id,
                "Connect your Plane account to continue.",
                connect_gate_blocks(connect_url(connection.workspace.slug)),
            )
        return
    if action_id == "manage_subscription":
        _handle_manage_subscription(connection, user, payload, action, channel_id)
        return
    if action_id == "issue_overflow":
        selected = (action.get("selected_option") or {}).get("value") or ""
        kind, _, raw_issue_id = selected.partition(":")
        issue_id = _issue_id(raw_issue_id)
        if not issue_id:
            return
        issue = Issue.objects.filter(pk=issue_id, workspace=connection.workspace).select_related("project", "state").first()
        if not issue or not can_get_issue(user, issue):
            return
        if kind == "unwatch":
            IssueSubscriber.objects.filter(issue=issue, subscriber=user).delete()
            return
        if kind == "unsync":
            _unsync_issue_thread(connection, user, issue, payload, channel_id)
            return
        if not allow_trigger or not trigger_id:
            return
        if kind == "state":
            states = State.objects.filter(project=issue.project).exclude(is_triage=True)[:100]
            options = [slack_option(str(s.id), s.name) for s in states]
            if not options:
                return
            bot_client(connection).views_open(
                trigger_id=trigger_id,
                view=_select_modal(
                    "issue_state_submission",
                    "Change state",
                    "state",
                    options,
                    {"issue_id": str(issue.id)},
                ),
            )
        elif kind == "priority":
            bot_client(connection).views_open(
                trigger_id=trigger_id,
                view=_select_modal(
                    "issue_priority_submission",
                    "Change priority",
                    "priority",
                    [slack_option(p, p.title()) for p in ("urgent", "high", "medium", "low", "none")],
                    {"issue_id": str(issue.id)},
                ),
            )
        return
    issue_id = _issue_id(action.get("value"))
    issue = (
        Issue.objects.filter(pk=issue_id, workspace=connection.workspace).select_related("project", "state").first()
        if issue_id
        else None
    )
    if action_id == "assign_to_me" and issue and can_get_issue(user, issue):
        current_ids = live_assignee_ids(issue)
        if str(user.id) in current_ids:
            return
        IssueAssignee.objects.get_or_create(
            issue=issue, assignee=user, project=issue.project, workspace=issue.workspace
        )
        emit_issue_updated(
            issue,
            user.id,
            {"assignee_ids": current_ids + [str(user.id)]},
            {"assignee_ids": current_ids},
        )
    elif action_id == "create_comment" and issue and can_get_issue(user, issue) and trigger_id and allow_trigger:
        bot_client(connection).views_open(
            trigger_id=trigger_id,
            view={
                "type": "modal",
                "callback_id": "issue_comment_submission",
                "private_metadata": json.dumps({"issue_id": str(issue.id), "channel_id": channel_id}),
                "title": {"type": "plain_text", "text": "Comment"},
                "submit": {"type": "plain_text", "text": "Add"},
                "blocks": [
                    {
                        "type": "input",
                        "block_id": "comment",
                        "label": {"type": "plain_text", "text": "Comment"},
                        "element": {"type": "plain_text_input", "action_id": "comment", "multiline": True},
                    }
                ],
            },
        )
    elif action_id == "watch_issue" and issue and can_get_issue(user, issue):
        IssueSubscriber.objects.get_or_create(
            issue=issue, subscriber=user, project=issue.project, workspace=issue.workspace
        )
    elif action_id == "unwatch_issue" and issue:
        IssueSubscriber.objects.filter(issue=issue, subscriber=user).delete()


def _unsync_issue_thread(connection, user, issue, payload: dict, channel_id: str | None) -> None:
    if not channel_id:
        return
    message = payload.get("message") or {}
    thread_ts = message.get("thread_ts") or message.get("ts")
    links = SlackThreadLink.objects.filter(issue=issue, channel_id=channel_id, sync_enabled=True)
    if thread_ts:
        links = links.filter(thread_ts=thread_ts)
    updated = links.update(sync_enabled=False)
    user_id = (payload.get("user") or {}).get("id")
    if updated:
        SlackAuditLog.objects.create(
            workspace=connection.workspace,
            actor=user,
            action="slack.thread.unsynced",
            metadata={"issue_id": str(issue.id), "channel_id": channel_id},
        )
        if user_id:
            post_ephemeral(connection, channel_id, user_id, "Stopped syncing this thread with Plane comments.")
        return
    if user_id:
        post_ephemeral(connection, channel_id, user_id, "No synced thread in this channel.")


def _handle_manage_subscription(connection, user, payload: dict, action: dict, channel_id: str | None) -> None:
    selected = (action.get("selected_option") or {}).get("value") or ""
    kind, _, raw_id = selected.partition(":")
    sub_id = _issue_id(raw_id)
    if not sub_id:
        return
    sub = SlackChannelSubscription.objects.filter(pk=sub_id, workspace_connection=connection).select_related("project").first()
    if not sub:
        return
    role = _project_role(user, sub.project_id)
    refresh_channel = channel_id or sub.channel_id
    if kind in {"pause", "resume"} and role >= ROLE.MEMBER.value:
        sub.is_paused = kind == "pause"
        sub.save(update_fields=["is_paused", "updated_at"])
        SlackAuditLog.objects.create(
            workspace=connection.workspace,
            actor=user,
            action="slack.subscription.paused" if sub.is_paused else "slack.subscription.resumed",
            metadata={"id": str(sub.id), "channel_id": sub.channel_id},
        )
    elif kind == "disconnect" and role >= ROLE.ADMIN.value:
        SlackAuditLog.objects.create(
            workspace=connection.workspace,
            actor=user,
            action="slack.subscription.deleted",
            metadata={"id": str(sub.id), "channel_id": sub.channel_id},
        )
        sub.delete()
    else:
        return
    view_id = (payload.get("view") or {}).get("id")
    _refresh_manage_modal(connection, user, view_id, refresh_channel)


def handle_select_property_submission(connection, payload: dict) -> None:
    view = payload.get("view") or {}
    callback = view.get("callback_id")
    user_id = (payload.get("user") or {}).get("id")
    user = mapped_user(connection, user_id)
    if not user:
        return
    metadata = json.loads(view.get("private_metadata") or "{}")
    values = (view.get("state") or {}).get("values") or {}
    issue = Issue.objects.filter(pk=metadata.get("issue_id"), workspace=connection.workspace).select_related(
        "project", "state"
    ).first()
    if not issue or not can_get_issue(user, issue):
        return
    if callback == "issue_state_submission":
        state_id = (values.get("state", {}).get("state", {}).get("selected_option") or {}).get("value")
        current = {"state": str(issue.state_id) if issue.state_id else None}
        issue.state_id = state_id
        issue.save(update_fields=["state_id", "updated_at"])
        emit_issue_updated(issue, user.id, {"state": state_id}, current)
    elif callback == "issue_priority_submission":
        priority = (values.get("priority", {}).get("priority", {}).get("selected_option") or {}).get("value")
        current = {"priority": issue.priority}
        issue.priority = priority
        issue.save(update_fields=["priority", "updated_at"])
        emit_issue_updated(issue, user.id, {"priority": priority}, current)


def _select_modal(callback_id, title, block_id, options, metadata):
    return {
        "type": "modal",
        "callback_id": callback_id,
        "private_metadata": json.dumps(metadata),
        "title": {"type": "plain_text", "text": title[:24]},
        "submit": {"type": "plain_text", "text": "Save"},
        "blocks": [
            {
                "type": "input",
                "block_id": block_id,
                "label": {"type": "plain_text", "text": title},
                "element": {"type": "static_select", "action_id": block_id, "options": options[:100]},
            }
        ],
    }


def handle_message_action(connection, payload: dict) -> None:
    callback = payload.get("callback_id")
    user_id = (payload.get("user") or {}).get("id")
    user = mapped_user(connection, user_id)
    channel_id = (payload.get("channel") or {}).get("id")
    trigger_id = payload.get("trigger_id")
    message = payload.get("message") or {}
    text = message.get("text") or ""
    if not user:
        post_ephemeral(
            connection,
            channel_id,
            user_id,
            "Connect your Plane account to continue.",
            connect_gate_blocks(connect_url(connection.workspace.slug)),
        )
        return
    if not trigger_id:
        return
    if callback in LINK_THREAD_CALLBACKS:
        thread_ts = message.get("thread_ts") or message.get("ts")
        keys = extract_uppercase_identifiers(text)
        open_link_thread_modal(
            connection, user, trigger_id, channel_id, thread_ts, initial_key=keys[0] if keys else ""
        )
        return
    intake = callback in INTAKE_CALLBACKS
    open_create_modal(connection, user, trigger_id, channel_id, prefill=text, intake=intake)


def handle_link_shared(connection, event: dict) -> None:
    slack_user_id = event.get("user")
    if slack_user_id and slack_user_id == connection.bot_user_id:
        return
    user = mapped_user(connection, slack_user_id)
    unfurls = {}
    for link in event.get("links") or []:
        url = link.get("url") or ""
        parsed = parse_plane_url(url)
        if not parsed or parsed.get("slug") != connection.workspace.slug:
            continue
        issue = None
        if parsed.get("type") == "issue":
            issue = (
                Issue.objects.filter(pk=parsed.get("issue_id"), workspace=connection.workspace)
                .select_related("project", "state", "workspace")
                .prefetch_related("assignees")
                .first()
            )
        elif parsed.get("type") == "issue_identifier":
            issue = issue_for_identifier(connection, parsed["project_identifier"], parsed["sequence_id"])
        if issue:
            if not user or not can_get_issue(user, issue):
                unfurls[url] = {
                    "blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "No access to this work item."}}]
                }
                continue
            unfurls[url] = {"blocks": issue_card_blocks(issue, connection.workspace.slug, issue_url(issue))}
            continue
        unfurls.update(_entity_unfurl(connection, user, url, parsed))
    if unfurls:
        try:
            post_link_unfurls(connection, event, unfurls)
        except SlackApiError as exc:
            logger.warning("Slack unfurl failed: %s", redact_tokens(str(exc)))


def _entity_unfurl(connection, user, url: str, parsed: dict) -> dict:
    kind = parsed.get("type")
    entity_id = parsed.get("id")
    if kind == "intake":
        intake = IntakeIssue.objects.filter(pk=entity_id, workspace=connection.workspace).select_related("issue").first()
        if not intake:
            return {}
        if not user or not can_get_issue(user, intake.issue):
            return {url: {"blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "No access"}}]}}
        return {
            url: {
                "blocks": [
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"Intake · {intake.issue.name}"},
                    }
                ]
            }
        }
    model = {"project": Project, "cycle": Cycle, "module": Module, "page": Page}.get(kind)
    if not model:
        return {}
    obj = model.objects.filter(pk=entity_id, workspace=connection.workspace).first()
    if not obj:
        return {}
    project_id = getattr(obj, "project_id", None) or (obj.id if kind == "project" else None)
    if kind == "page":
        if not user:
            return {url: {"blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "No access"}}]}}
    elif project_id and (not user or not is_project_member(user, project_id)):
        return {url: {"blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "No access"}}]}}
    name = getattr(obj, "name", None) or str(obj.id)
    return {url: {"blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": f"*{kind.title()}*: {name}"}}]}}


def handle_message(connection, event: dict) -> None:
    if event.get("bot_id") or event.get("subtype"):
        return
    text = event.get("text") or ""
    slack_user_id = event.get("user")
    user = mapped_user(connection, slack_user_id)
    thread_ts = event.get("thread_ts")
    channel_id = event.get("channel")
    ts = event.get("ts")
    if thread_ts:
        link = (
            SlackThreadLink.objects.filter(channel_id=channel_id, thread_ts=thread_ts, sync_enabled=True)
            .select_related("issue")
            .first()
        )
        if link:
            ingest_slack_thread_reply(
                connection=connection,
                issue=link.issue,
                slack_user_id=slack_user_id,
                text=text,
                external_id=ts,
            )
            return
    if not user:
        return
    for key in extract_uppercase_identifiers(text):
        project_identifier, sequence_id = key.split("-", 1)
        issue = issue_for_identifier(connection, project_identifier, int(sequence_id))
        if issue and can_get_issue(user, issue):
            bot_client(connection).chat_postMessage(
                channel=channel_id,
                thread_ts=ts,
                text=f"{issue.project.identifier}-{issue.sequence_id}",
                blocks=issue_card_blocks(issue, connection.workspace.slug, issue_url(issue)),
            )
            break


def handle_app_home(connection, event: dict) -> None:
    if event.get("tab") not in {None, "home"}:
        return
    user_id = event.get("user")
    user = mapped_user(connection, user_id)
    client = bot_client(connection)
    if not user:
        client.views_publish(
            user_id=user_id,
            view={"type": "home", "blocks": connect_gate_blocks(connect_url(connection.workspace.slug))},
        )
        return
    assigned = (
        Issue.objects.filter(
            workspace=connection.workspace,
            archived_at__isnull=True,
            issue_assignee__assignee=user,
            issue_assignee__deleted_at__isnull=True,
        )
        .select_related("project", "state")
        .distinct()[:8]
    )
    watching = Issue.objects.filter(
        issue_subscribers__subscriber=user, workspace=connection.workspace, archived_at__isnull=True
    ).select_related("project", "state")[:8]
    blocks = [{"type": "header", "text": {"type": "plain_text", "text": "Assigned to you"}}]
    for issue in assigned:
        blocks.extend(issue_card_blocks(issue, connection.workspace.slug, issue_url(issue), include_actions=True))
    blocks.append({"type": "header", "text": {"type": "plain_text", "text": "Watching"}})
    for issue in watching:
        blocks.extend(issue_card_blocks(issue, connection.workspace.slug, issue_url(issue), include_actions=True))
    client.views_publish(user_id=user_id, view={"type": "home", "blocks": blocks[:50]})


def handle_uninstall(connection) -> None:
    connection.is_enabled = False
    connection.app_uninstalled_at = timezone.now()
    connection.set_bot_tokens("", "")
    connection.save()
    SlackAuditLog.objects.create(workspace=connection.workspace, action="slack.app.uninstalled", metadata={})


MENTION_RE = re.compile(r"<@[^>]+>\s*")


def handle_app_mention(connection, event: dict) -> None:
    slack_user_id = event.get("user")
    user = mapped_user(connection, slack_user_id)
    channel_id = event.get("channel")
    thread_ts = event.get("thread_ts") or event.get("ts")
    text = MENTION_RE.sub("", event.get("text") or "").strip()
    if not user:
        post_ephemeral(
            connection,
            channel_id,
            slack_user_id,
            "Connect your Plane account to continue.",
            connect_gate_blocks(connect_url(connection.workspace.slug)),
        )
        return
    project = member_projects(connection, user).first()
    if not project:
        post_ephemeral(connection, channel_id, slack_user_id, "You are not a member of any project.")
        return
    description = ""
    if thread_ts:
        try:
            replies = bot_client(connection).conversations_replies(channel=channel_id, ts=thread_ts, limit=20)
            description = "\n".join(
                (msg.get("text") or "") for msg in (replies.get("messages") or []) if not msg.get("bot_id")
            )[:4000]
        except SlackApiError as exc:
            logger.warning("Thread context fetch failed: %s", redact_tokens(str(exc)))
    title = text or (description.split("\n", 1)[0] if description else "Untitled")
    issue = create_issue_from_slack(project=project, user=user, title=title[:255], description=description)
    bot_client(connection).chat_postMessage(
        channel=channel_id,
        thread_ts=thread_ts,
        text=f"Created {issue.project.identifier}-{issue.sequence_id}",
        blocks=issue_card_blocks(issue, connection.workspace.slug, issue_url(issue)),
    )


def backfill_thread(connection, link: SlackThreadLink) -> None:
    try:
        replies = bot_client(connection).conversations_replies(
            channel=link.channel_id, ts=link.thread_ts, limit=50
        )
    except SlackApiError as exc:
        logger.warning("Thread backfill failed: %s", redact_tokens(str(exc)))
        return
    for msg in replies.get("messages") or []:
        if msg.get("bot_id") or msg.get("ts") == link.thread_ts:
            continue
        ingest_slack_thread_reply(
            connection=connection,
            issue=link.issue,
            slack_user_id=msg.get("user"),
            text=msg.get("text") or "",
            external_id=msg.get("ts"),
        )


def handle_event(payload: dict) -> None:
    event = payload.get("event") or {}
    event_id = payload.get("event_id") or event.get("event_ts")
    if not claim_event(str(event_id) if event_id else None):
        return
    team_id = payload.get("team_id") or event.get("team")
    connection = workspace_connection_for_team(team_id)
    if not connection:
        return
    event_type = event.get("type")
    if event_type == "link_shared":
        handle_link_shared(connection, event)
    elif event_type == "message":
        handle_message(connection, event)
    elif event_type in {"app_uninstalled", "tokens_revoked"}:
        handle_uninstall(connection)
    elif event_type == "app_home_opened":
        handle_app_home(connection, event)
    elif event_type == "app_mention":
        handle_app_mention(connection, event)
    elif event_type == "reaction_added":
        logger.info("Slack reaction_added ignored (W8.4 not enabled)")
