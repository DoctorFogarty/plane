# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

from plane.utils.issue_assignees import live_assignee_ids
from plane.utils.slack.transitions import escape_mrkdwn, user_names_for_ids


def truncate_option(text: str, limit: int = 75) -> str:
    value = text or ""
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def connect_gate_blocks(connect_url: str) -> list[dict]:
    return [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": "Connect your Plane account to use this Slack action."},
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Connect Plane account"},
                    "url": connect_url,
                    "action_id": "connect_plane_account",
                }
            ],
        },
    ]


NONE_LABEL = "None"


def issue_snapshot_mrkdwn(issue, url: str = "", *, receiver_id=None) -> str:
    identifier = f"{issue.project.identifier}-{issue.sequence_id}"
    title = escape_mrkdwn(issue.name or "")
    if url.startswith(("http://", "https://")):
        title_line = f"*<{url}|{identifier}>* {title}"
    else:
        title_line = f"*{identifier}* {title}"
    status = escape_mrkdwn(issue.state.name if issue.state_id else NONE_LABEL)
    issue_type = NONE_LABEL
    issue_type_obj = getattr(issue, "type", None) if getattr(issue, "type_id", None) else None
    if issue_type_obj is not None:
        issue_type = escape_mrkdwn(issue_type_obj.name or NONE_LABEL)
    assignee = escape_mrkdwn(user_names_for_ids(live_assignee_ids(issue), receiver_id))
    priority = issue.priority or "none"
    priority = NONE_LABEL if priority == "none" else priority.title()
    return f"{title_line}\nStatus: {status}    Type: {issue_type}\nAssignee: {assignee}    Priority: {priority}"


def issue_card_blocks(
    issue,
    workspace_slug: str,
    url: str,
    *,
    include_actions: bool = True,
    headline: str | None = None,
    receiver_id=None,
) -> list[dict]:
    blocks: list[dict] = []
    if headline:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": headline}})
    blocks.append(
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": issue_snapshot_mrkdwn(issue, url, receiver_id=receiver_id)},
        }
    )
    if include_actions:
        elements: list[dict] = [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Assign to me"},
                "action_id": "assign_to_me",
                "value": str(issue.id),
            },
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Comment"},
                "action_id": "create_comment",
                "value": str(issue.id),
            },
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Watch"},
                "action_id": "watch_issue",
                "value": str(issue.id),
            },
            {
                "type": "overflow",
                "action_id": "issue_overflow",
                "options": [
                    {"text": {"type": "plain_text", "text": "Change state"}, "value": f"state:{issue.id}"},
                    {"text": {"type": "plain_text", "text": "Change priority"}, "value": f"priority:{issue.id}"},
                    {"text": {"type": "plain_text", "text": "Unwatch"}, "value": f"unwatch:{issue.id}"},
                ],
            },
        ]
        if url.startswith(("http://", "https://")):
            elements.append(
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Open in Plane"},
                    "url": url,
                    "action_id": "open_in_plane",
                }
            )
        blocks.append(
            {
                "type": "actions",
                "block_id": f"issue_actions:{issue.id}",
                "elements": elements,
            }
        )
    return blocks


def project_select_modal(options: list[dict], metadata: str) -> dict:
    return {
        "type": "modal",
        "callback_id": "project_selection",
        "private_metadata": metadata,
        "title": {"type": "plain_text", "text": "Create work item"},
        "submit": {"type": "plain_text", "text": "Next"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "input",
                "block_id": "project",
                "label": {"type": "plain_text", "text": "Project"},
                "element": {
                    "type": "static_select",
                    "action_id": "project",
                    "options": options[:100],
                },
            }
        ],
    }


def create_issue_modal(metadata: str, state_options: list[dict], label_options: list[dict]) -> dict:
    priority_options = [
        {"text": {"type": "plain_text", "text": p.title()}, "value": p}
        for p in ("urgent", "high", "medium", "low", "none")
    ]
    blocks = [
        {
            "type": "input",
            "block_id": "title",
            "label": {"type": "plain_text", "text": "Title"},
            "element": {"type": "plain_text_input", "action_id": "title"},
        },
        {
            "type": "input",
            "block_id": "description",
            "optional": True,
            "label": {"type": "plain_text", "text": "Description"},
            "element": {"type": "plain_text_input", "action_id": "description", "multiline": True},
        },
        {
            "type": "input",
            "block_id": "priority",
            "optional": True,
            "label": {"type": "plain_text", "text": "Priority"},
            "element": {
                "type": "static_select",
                "action_id": "priority",
                "options": priority_options,
            },
        },
    ]
    if state_options:
        blocks.append(
            {
                "type": "input",
                "block_id": "state",
                "optional": True,
                "label": {"type": "plain_text", "text": "State"},
                "element": {"type": "static_select", "action_id": "state", "options": state_options[:100]},
            }
        )
    if label_options:
        blocks.append(
            {
                "type": "input",
                "block_id": "labels",
                "optional": True,
                "label": {"type": "plain_text", "text": "Labels"},
                "element": {"type": "multi_static_select", "action_id": "labels", "options": label_options[:100]},
            }
        )
    blocks.append(
        {
            "type": "input",
            "block_id": "thread_sync",
            "optional": True,
            "label": {"type": "plain_text", "text": "Thread sync"},
            "element": {
                "type": "checkboxes",
                "action_id": "thread_sync",
                "options": [{"text": {"type": "plain_text", "text": "Sync Slack thread with comments"}, "value": "1"}],
            },
        }
    )
    return {
        "type": "modal",
        "callback_id": "issue_submission",
        "private_metadata": metadata,
        "title": {"type": "plain_text", "text": "New work item"},
        "submit": {"type": "plain_text", "text": "Create"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": blocks,
    }


def slack_option(id_: str, name: str) -> dict:
    return {"text": {"type": "plain_text", "text": truncate_option(name)}, "value": str(id_)}
