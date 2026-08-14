# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
from html import escape

from slack_sdk.errors import SlackApiError

from django.utils import timezone

from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Intake,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueComment,
    ProjectMember,
    SlackUserConnection,
    SlackWorkspaceConnection,
    State,
)
from plane.utils.slack.tokens import bot_client


def workspace_connection_for_team(team_id: str) -> SlackWorkspaceConnection | None:
    return (
        SlackWorkspaceConnection.objects.filter(team_id=team_id, is_enabled=True, app_uninstalled_at__isnull=True)
        .select_related("workspace", "workspace_integration", "workspace_integration__actor")
        .first()
    )


def mapped_user(connection: SlackWorkspaceConnection, slack_user_id: str):
    link = (
        SlackUserConnection.objects.filter(workspace_connection=connection, slack_user_id=slack_user_id)
        .select_related("user")
        .first()
    )
    return link.user if link else None


def is_project_member(user, project_id) -> bool:
    if not user:
        return False
    return ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True).exists()


def can_get_issue(user, issue: Issue) -> bool:
    if not is_project_member(user, issue.project_id):
        return False
    membership = ProjectMember.objects.filter(project_id=issue.project_id, member=user, is_active=True).first()
    if membership and membership.role == 5:
        project = issue.project
        if not getattr(project, "guest_view_all_features", False) and issue.created_by_id != user.id:
            return False
    return True


def emit_issue_created(issue, actor_id):
    issue_activity.delay(
        type="issue.activity.created",
        requested_data=json.dumps({"name": issue.name}),
        actor_id=str(actor_id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=None,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=None,
    )


def emit_issue_updated(issue, actor_id, requested_data: dict, current_instance: dict):
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps(requested_data),
        actor_id=str(actor_id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=json.dumps(current_instance),
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=None,
    )


def create_issue_from_slack(*, project, user, title: str, description: str = "", priority: str = "none", state_id=None):
    issue = Issue.objects.create(
        name=title[:255] or "Untitled",
        description_html=f"<p>{escape(description)}</p>" if description else "<p></p>",
        project=project,
        workspace=project.workspace,
        priority=priority or "none",
        state_id=state_id,
        created_by=user,
    )
    IssueAssignee.objects.get_or_create(issue=issue, assignee=user, project=project, workspace=project.workspace)
    emit_issue_created(issue, user.id)
    return issue


def integration_bot_user(connection: SlackWorkspaceConnection):
    integration = getattr(connection, "workspace_integration", None)
    return getattr(integration, "actor", None) if integration else None


def slack_user_display_name(connection: SlackWorkspaceConnection, slack_user_id: str) -> str:
    if not slack_user_id:
        return "Someone"
    try:
        info = bot_client(connection).users_info(user=slack_user_id)
        user = info.get("user") or {}
        profile = user.get("profile") or {}
        return (
            profile.get("display_name")
            or profile.get("real_name")
            or user.get("real_name")
            or user.get("name")
            or slack_user_id
        )
    except SlackApiError:
        return slack_user_id


def add_comment(*, issue, user, text: str, external_id: str | None = None, author_label: str | None = None):
    if external_id:
        existing = IssueComment.objects.filter(
            issue=issue, external_source="SLACK_COMMENT", external_id=external_id
        ).first()
        if existing:
            return existing
    if author_label:
        comment_html = f"<p><strong>{escape(author_label)} (from Slack):</strong> {escape(text or '')}</p>"
        comment_stripped = f"{author_label} (from Slack): {text or ''}"
    else:
        comment_html = f"<p>{escape(text)}</p>"
        comment_stripped = text
    comment = IssueComment.objects.create(
        issue=issue,
        actor=user,
        comment_html=comment_html,
        comment_stripped=comment_stripped,
        project=issue.project,
        workspace=issue.workspace,
        external_source="SLACK_COMMENT" if external_id else None,
        external_id=external_id,
    )
    issue_activity.delay(
        type="comment.activity.created",
        requested_data=json.dumps({"comment_html": comment.comment_html}),
        actor_id=str(user.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        current_instance=None,
        epoch=int(timezone.now().timestamp()),
        notification=True,
        origin=None,
    )
    return comment


def ingest_slack_thread_reply(*, connection, issue, slack_user_id, text: str, external_id: str | None = None):
    user = mapped_user(connection, slack_user_id)
    if user:
        if not can_get_issue(user, issue):
            return None
        return add_comment(issue=issue, user=user, text=text or "", external_id=external_id)
    bot = integration_bot_user(connection)
    if not bot:
        return None
    label = slack_user_display_name(connection, slack_user_id)
    return add_comment(
        issue=issue,
        user=bot,
        text=text or "",
        external_id=external_id,
        author_label=label,
    )


def create_intake_issue_from_slack(*, project, user, title: str, description: str = ""):
    triage_state = State.objects.filter(project=project, is_triage=True).first()
    issue = create_issue_from_slack(
        project=project,
        user=user,
        title=title,
        description=description,
        state_id=triage_state.id if triage_state else None,
    )
    intake = Intake.objects.filter(project=project).first()
    if not intake:
        intake = Intake.objects.create(
            name="Intake",
            project=project,
            workspace=project.workspace,
            is_default=True,
        )
    IntakeIssue.objects.create(
        intake=intake,
        issue=issue,
        project=project,
        workspace=project.workspace,
        source="SLACK",
        created_by=user,
    )
    return issue


def post_ephemeral(connection, channel_id: str, user_id: str, text: str, blocks=None):
    client = bot_client(connection)
    kwargs = {"channel": channel_id, "user": user_id, "text": text}
    if blocks:
        kwargs["blocks"] = blocks
    client.chat_postEphemeral(**kwargs)
