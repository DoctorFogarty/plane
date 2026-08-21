# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hmac
import hashlib
import json
import time
from urllib.parse import parse_qs, urlencode, urlparse
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from slack_sdk.errors import SlackApiError

from plane.app.views.integration.slack import SlackEventsEndpoint, SlackInteractiveEndpoint, SlackWorkspaceOAuthCallbackEndpoint
from plane.bgtasks.notification_task import (
    _maybe_slack_dm,
    _mute_email_for_slack,
    deleted_issue_requested_data,
    notifications,
)
from plane.db.models import (
    APIToken,
    Integration,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    IssueProperty,
    IssuePropertyType,
    IssuePropertyValue,
    IssueSubscriber,
    IssueType,
    Label,
    Notification,
    Project,
    ProjectIssueType,
    ProjectMember,
    SlackChannelSubscription,
    SlackEventIdempotency,
    SlackThreadLink,
    SlackUserConnection,
    SlackWorkspaceConnection,
    State,
    User,
    UserNotificationPreference,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.utils.automation.actions import execute_post_slack_message
from plane.utils.issue_assignees import live_assignee_ids, live_assignee_names
from plane.utils.slack.blocks import issue_card_blocks
from plane.utils.slack.channels import list_bot_channels, post_link_unfurls, resolve_slack_channel
from plane.utils.slack.filters import (
    activity_event_keys,
    events_allowed,
    subscription_matches_issue,
)
from plane.utils.slack.handlers import (
    claim_event,
    handle_block_actions,
    handle_link_shared,
    handle_message_action,
    handle_slash,
    view_submission_response,
)
from plane.utils.slack.runtime import add_comment, create_issue_from_slack, ingest_slack_thread_reply
from plane.utils.slack.signing import verify_slack_signature
from plane.utils.slack.slash import parse_slash_create_args, should_open_create_modal, should_open_manage_modal
from plane.utils.slack.tokens import redact_tokens, refresh_bot_token
from plane.utils.slack.transitions import format_slack_headline, format_thread_comment_for_slack
from plane.utils.slack.urls import extract_uppercase_identifiers, parse_plane_url, public_origin, work_item_url
from plane.utils.slack.oauth import slack_authorize_url, slack_oauth_redirect_uri
from plane.license.models import Instance


SECRET = "slack-signing-secret"
CLIENT_SECRET = "super-secret-slack-client"


def _sign(body: bytes, secret: str = SECRET, ts: int | None = None) -> dict:
    ts = ts or int(time.time())
    digest = hmac.new(secret.encode(), f"v0:{ts}:{body.decode()}".encode(), hashlib.sha256).hexdigest()
    return {
        "HTTP_X_SLACK_REQUEST_TIMESTAMP": str(ts),
        "HTTP_X_SLACK_SIGNATURE": f"v0={digest}",
    }


@pytest.fixture
def slack_context(db, create_user):
    workspace = Workspace.objects.create(name="Slack WS", slug="slack-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="Slack Project",
        identifier="SLK",
        workspace=workspace,
        created_by=create_user,
        network=2,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    state = State.objects.create(name="Todo", project=project, group="backlog", default=True)
    integration = Integration.objects.create(title="Slack", provider="slack", verified=True)
    bot = User.objects.create(email="slack-bot@plane.so", username="slack-bot", is_bot=True)
    token = APIToken.objects.create(user=bot, user_type=1, workspace=workspace, is_service=True)
    wi = WorkspaceIntegration.objects.create(
        workspace=workspace, integration=integration, actor=bot, api_token=token, config={"team_id": "T1"}
    )
    connection = SlackWorkspaceConnection.objects.create(
        workspace=workspace,
        workspace_integration=wi,
        team_id="T1",
        team_name="Team",
        is_enabled=True,
    )
    connection.set_bot_tokens("xoxb-test-token", "xoxe-refresh")
    connection.save()
    SlackUserConnection.objects.create(
        workspace_connection=connection,
        user=create_user,
        slack_user_id="U123",
    )
    issue = Issue.objects.create(
        name="Secret title",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )
    return {
        "workspace": workspace,
        "project": project,
        "user": create_user,
        "connection": connection,
        "issue": issue,
        "state": state,
    }


@pytest.mark.unit
def test_redact_tokens():
    assert "[redacted-token]" in redact_tokens("token xoxb-1234567890abcdef rest")
    assert "xoxb-1234567890abcdef" not in redact_tokens("token xoxb-1234567890abcdef rest")


@pytest.mark.unit
def test_verify_slack_signature_accepts_and_rejects():
    body = b'{"ok":true}'
    headers = _sign(body)
    assert (
        verify_slack_signature(
            body,
            headers["HTTP_X_SLACK_REQUEST_TIMESTAMP"],
            headers["HTTP_X_SLACK_SIGNATURE"],
            SECRET,
        )
        is True
    )
    assert verify_slack_signature(body, headers["HTTP_X_SLACK_REQUEST_TIMESTAMP"], "v0=deadbeef", SECRET) is False
    assert verify_slack_signature(body, str(int(time.time()) - 400), headers["HTTP_X_SLACK_SIGNATURE"], SECRET) is False
    assert verify_slack_signature(body, headers["HTTP_X_SLACK_REQUEST_TIMESTAMP"], headers["HTTP_X_SLACK_SIGNATURE"], "") is False


@pytest.mark.unit
def test_refresh_bot_token_single_flight(slack_context):
    connection = slack_context["connection"]
    cache.clear()
    with patch("plane.utils.slack.tokens.cache.add", return_value=False), patch(
        "plane.utils.slack.tokens.time.sleep"
    ), patch("plane.utils.slack.tokens.WebClient") as client_cls:
        token = refresh_bot_token(connection)
        client_cls.assert_not_called()
        assert token == connection.get_bot_access_token()


@pytest.mark.unit
def test_uppercase_identifiers_only():
    assert extract_uppercase_identifiers("see SLK-12 and abc-9") == ["SLK-12"]
    assert extract_uppercase_identifiers("abc-9") == []


@pytest.mark.unit
def test_oauth_redirect_uri_uses_web_url_when_app_base_url_missing():
    with override_settings(APP_BASE_URL=None, WEB_URL="https://plane.teamcodeorange.com"):
        uri = slack_oauth_redirect_uri("workspace")
    assert uri == "https://plane.teamcodeorange.com/api/hooks/slack/oauth/workspace"


@pytest.mark.unit
def test_oauth_redirect_uri_prefers_app_base_url():
    with override_settings(APP_BASE_URL="https://app.example.com", WEB_URL="https://api.example.com"):
        assert slack_oauth_redirect_uri("user") == "https://app.example.com/api/hooks/slack/oauth/user"


@pytest.mark.unit
def test_oauth_redirect_uri_rejects_missing_origin():
    with override_settings(APP_BASE_URL="", WEB_URL=None):
        with pytest.raises(ImproperlyConfigured):
            slack_oauth_redirect_uri("workspace")


@pytest.mark.unit
def test_authorize_url_sends_absolute_redirect_uri():
    with override_settings(APP_BASE_URL=None, WEB_URL="https://plane.teamcodeorange.com"):
        with patch(
            "plane.utils.slack.oauth.get_slack_app_config",
            return_value={"client_id": "cid.public", "client_secret": "x", "signing_secret": "y"},
        ):
            url = slack_authorize_url(state="abc", user_only=False)
    params = parse_qs(urlparse(url).query)
    assert params["redirect_uri"] == ["https://plane.teamcodeorange.com/api/hooks/slack/oauth/workspace"]
    assert not params["redirect_uri"][0].startswith("/")


@pytest.mark.unit
def test_work_item_url_falls_back_to_web_url():
    with override_settings(APP_BASE_URL=None, WEB_URL="https://plane.teamcodeorange.com"):
        assert public_origin() == "https://plane.teamcodeorange.com"
        assert work_item_url("code-orange", "ENG", 12) == "https://plane.teamcodeorange.com/code-orange/browse/ENG-12/"


@pytest.mark.unit
def test_parse_plane_url_issue_and_entities():
    parsed = parse_plane_url("https://plane.teamcodeorange.com/slack-ws/issues/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    assert parsed and parsed["type"] == "issue"
    assert parsed["slug"] == "slack-ws"
    parsed_nested = parse_plane_url(
        "https://plane.teamcodeorange.com/slack-ws/projects/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/issues/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    )
    assert parsed_nested and parsed_nested["slug"] == "slack-ws" and parsed_nested["type"] == "issue"
    parsed_key = parse_plane_url("https://plane.teamcodeorange.com/slack-ws/browse/SLK-12")
    assert parsed_key and parsed_key["type"] == "issue_identifier"
    assert parsed_key["slug"] == "slack-ws"


@pytest.mark.unit
@pytest.mark.django_db
def test_public_instance_config_omits_slack_secrets(api_client):
    Instance.objects.create(
        instance_name="Test",
        instance_id=str(uuid4()),
        current_version="1.0.0",
        last_checked_at=timezone.now(),
        is_setup_done=True,
    )
    values = [
        "1",
        "0",
        "0",
        "0",
        "",
        "0",
        "0",
        "",
        "0",
        "1",
        "public-client-id",
        CLIENT_SECRET,
        SECRET,
        None,
        None,
        "",
        "",
    ]
    with (
        patch("plane.license.api.views.instance.get_configuration_value", return_value=tuple(values)),
        patch("plane.utils.github.GitHubAppClient") as gh,
    ):
        gh.return_value.is_configured = False
        response = api_client.get("/api/instances/")
    assert response.status_code == 200
    payload = json.dumps(response.data, default=str)
    assert CLIENT_SECRET not in payload
    assert SECRET not in payload
    assert "slack_client_secret" not in payload.lower()
    assert response.data["config"]["slack_client_id"] == "public-client-id"
    assert response.data["config"]["is_slack_configured"] is True


@pytest.mark.unit
@pytest.mark.django_db
def test_unsigned_slack_events_401():
    factory = APIRequestFactory()
    request = factory.post("/api/hooks/slack/events", {"type": "url_verification", "challenge": "abc"}, format="json")
    response = SlackEventsEndpoint.as_view()(request)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.unit
@pytest.mark.django_db
def test_url_verification_challenge():
    body = json.dumps({"type": "url_verification", "challenge": "abc123"}).encode()
    factory = APIRequestFactory()
    request = factory.post("/api/hooks/slack/events", body, content_type="application/json", **_sign(body))
    with patch("plane.app.views.integration.slack.get_slack_app_config", return_value={"signing_secret": SECRET}):
        response = SlackEventsEndpoint.as_view()(request)
    assert response.status_code == 200
    assert response.data["challenge"] == "abc123"


@pytest.mark.unit
@pytest.mark.django_db
def test_interactive_block_actions_ack_has_empty_body(slack_context):
    payload = {
        "type": "block_actions",
        "team": {"id": "T1"},
        "user": {"id": "U123"},
        "channel": {"id": "C1"},
        "actions": [{"action_id": "watch_issue", "value": str(slack_context["issue"].id)}],
    }
    form = urlencode({"payload": json.dumps(payload)}).encode()
    factory = APIRequestFactory()
    request = factory.post(
        "/api/hooks/slack/interactive",
        form,
        content_type="application/x-www-form-urlencoded",
        **_sign(form),
    )
    with patch(
        "plane.app.views.integration.slack.get_slack_app_config",
        return_value={"signing_secret": SECRET, "client_id": "x", "client_secret": "y"},
    ), patch("plane.app.views.integration.slack.handle_block_actions"):
        response = SlackInteractiveEndpoint.as_view()(request)
    assert response.status_code == 200
    assert response.content == b""


@pytest.mark.unit
@pytest.mark.django_db
def test_duplicate_event_id_is_noop():
    assert claim_event("Ev123") is True
    assert claim_event("Ev123") is False
    assert SlackEventIdempotency.objects.filter(event_id="Ev123").count() == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_slash_connect_gate_when_unmapped(slack_context):
    SlackUserConnection.objects.all().delete()
    with patch("plane.utils.slack.handlers.post_ephemeral") as ephemeral:
        handle_slash(
            slack_context["connection"],
            {"user_id": "U999", "channel_id": "C1", "text": "create", "trigger_id": "trig"},
        )
        ephemeral.assert_called()
        assert "Connect" in ephemeral.call_args.args[3]


@pytest.mark.unit
@pytest.mark.django_db
def test_create_issue_from_slack_and_thread_dedupe(slack_context):
    with patch("plane.utils.slack.runtime.issue_activity.delay"):
        issue = create_issue_from_slack(
            project=slack_context["project"],
            user=slack_context["user"],
            title="From Slack",
            description="body",
        )
        assert issue.sequence_id
        first = add_comment(issue=issue, user=slack_context["user"], text="hello", external_id="111.222")
        second = add_comment(issue=issue, user=slack_context["user"], text="hello again", external_id="111.222")
    assert first.id == second.id
    assert IssueComment.objects.filter(issue=issue).count() == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_unfurl_hides_title_without_access(slack_context):
    outsider = User.objects.create(email="out@plane.so", username="outsider")
    SlackUserConnection.objects.create(
        workspace_connection=slack_context["connection"],
        user=outsider,
        slack_user_id="UOUT",
    )
    issue = slack_context["issue"]
    url = f"https://plane.teamcodeorange.com/slack-ws/issues/{issue.id}"
    client = MagicMock()
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        handle_link_shared(
            slack_context["connection"],
            {"user": "UOUT", "channel": "C1", "message_ts": "1.2", "links": [{"url": url}]},
        )
    unfurls = client.chat_unfurl.call_args.kwargs["unfurls"]
    blob = json.dumps(unfurls)
    assert "Secret title" not in blob
    assert "No access" in blob


@pytest.mark.unit
@pytest.mark.django_db
def test_bot_link_shared_does_not_unfurl(slack_context):
    connection = slack_context["connection"]
    connection.bot_user_id = "B0BOT"
    connection.save(update_fields=["bot_user_id"])
    issue = slack_context["issue"]
    url = f"https://plane.teamcodeorange.com/slack-ws/browse/SLK-{issue.sequence_id}/"
    client = MagicMock()
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        handle_link_shared(
            connection,
            {"user": "B0BOT", "channel": "D1", "message_ts": "1.2", "links": [{"url": url}]},
        )
    client.chat_unfurl.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_unfurl_passes_unfurl_id_and_source(slack_context):
    issue = slack_context["issue"]
    url = f"https://plane.teamcodeorange.com/slack-ws/browse/SLK-{issue.sequence_id}/"
    client = MagicMock()
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        handle_link_shared(
            slack_context["connection"],
            {
                "user": "U123",
                "channel": "CNEW",
                "message_ts": "1.2",
                "unfurl_id": "Uf9",
                "source": "conversations_history",
                "links": [{"url": url}],
            },
        )
    kwargs = client.chat_unfurl.call_args.kwargs
    assert kwargs["unfurl_id"] == "Uf9"
    assert kwargs["source"] == "conversations_history"
    assert url in kwargs["unfurls"]


@pytest.mark.unit
def test_list_bot_channels_paginates_and_sorts():
    client = MagicMock()
    client.users_conversations.side_effect = [
        {
            "channels": [{"id": "C1", "name": "zebra", "is_private": False}],
            "response_metadata": {"next_cursor": "page2"},
        },
        {
            "channels": [{"id": "C2", "name": "alpha", "is_private": True}],
            "response_metadata": {"next_cursor": ""},
        },
    ]
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        channels = list_bot_channels(MagicMock())
    assert [item["id"] for item in channels] == ["C2", "C1"]
    assert client.users_conversations.call_count == 2
    assert client.users_conversations.call_args_list[1].kwargs["cursor"] == "page2"


@pytest.mark.unit
def test_resolve_slack_channel_requires_membership():
    client = MagicMock()
    client.conversations_info.return_value = {
        "channel": {"id": "C1", "name": "general", "is_private": False, "is_member": False}
    }
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        assert resolve_slack_channel(MagicMock(), "C1") is None


@pytest.mark.unit
def test_post_link_unfurls_sends_unfurl_id_and_source():
    client = MagicMock()
    unfurls = {"https://example.com": {"blocks": []}}
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        post_link_unfurls(
            MagicMock(),
            {
                "unfurl_id": "Uf1",
                "source": "composer",
                "channel": "C1",
                "message_ts": "1.2",
            },
            unfurls,
        )
    kwargs = client.chat_unfurl.call_args.kwargs
    assert kwargs["unfurl_id"] == "Uf1"
    assert kwargs["source"] == "composer"
    assert kwargs["unfurls"] == unfurls
    assert "channel" not in kwargs
    assert "ts" not in kwargs


@pytest.mark.unit
def test_post_link_unfurls_joins_channel_after_not_in_channel():
    client = MagicMock()
    client.chat_unfurl.side_effect = [
        SlackApiError("not_in_channel", {"ok": False, "error": "not_in_channel"}),
        {"ok": True},
    ]
    with patch("plane.utils.slack.channels.bot_client", return_value=client):
        post_link_unfurls(
            MagicMock(),
            {"channel": "CNEW", "message_ts": "1.2"},
            {"https://example.com": {"blocks": []}},
        )
    client.conversations_join.assert_called_once_with(channel="CNEW")
    assert client.chat_unfurl.call_count == 2


@pytest.mark.unit
@pytest.mark.django_db
def test_link_shared_event_is_handled_inline():
    body = json.dumps(
        {
            "type": "event_callback",
            "team_id": "T1",
            "event_id": "EvUNFURL",
            "event": {"type": "link_shared", "user": "U1", "channel": "C1", "links": []},
        }
    ).encode()
    factory = APIRequestFactory()
    request = factory.post("/api/hooks/slack/events", body, content_type="application/json", **_sign(body))
    with (
        patch("plane.app.views.integration.slack.get_slack_app_config", return_value={"signing_secret": SECRET}),
        patch("plane.app.views.integration.slack.handle_event") as handle,
        patch("plane.app.views.integration.slack.process_slack_event.delay") as delay,
    ):
        response = SlackEventsEndpoint.as_view()(request)
    assert response.status_code == 200
    handle.assert_called_once()
    delay.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_open_in_plane_button_ignores_empty_value(slack_context):
    handle_block_actions(
        slack_context["connection"],
        {
            "user": {"id": "U123"},
            "channel": {"id": "C1"},
            "actions": [
                {
                    "action_id": "open_in_plane",
                    "url": "https://plane.teamcodeorange.com/slack-ws/browse/SLK-1/",
                }
            ],
        },
    )


@pytest.mark.unit
@pytest.mark.django_db
def test_channel_subscription_pause_and_secret_project(slack_context):
    project = slack_context["project"]
    project.network = 0
    project.save(update_fields=["network"])
    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=project,
        workspace=project.workspace,
        channel_id="C1",
        is_private_channel=False,
        public_channel_ack=False,
        events=["create", "state", "assignee", "comment"],
    )
    assert sub.filter_hash == ""
    other = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=project,
        workspace=project.workspace,
        channel_id="C1",
        filter_payload={"priority": ["high"]},
        events=["create"],
        public_channel_ack=True,
    )
    assert other.filter_hash != sub.filter_hash
    sub.is_paused = True
    sub.save()
    from plane.bgtasks.slack_task import deliver_slack_channel

    with patch("plane.bgtasks.slack_task.bot_client") as client:
        deliver_slack_channel.run(str(sub.id), str(slack_context["issue"].id), "create", "created")
        client.assert_not_called()


@pytest.mark.unit
def test_subscription_filter_priority():
    issue = MagicMock(priority="low", state_id=uuid4())
    assert subscription_matches_issue(issue, {"priority": ["high"]}) is False
    assert subscription_matches_issue(issue, {"priority": ["low"]}) is True
    assert subscription_matches_issue(issue, {}) is True


def _assign(issue, user, *, deleted=False):
    link = IssueAssignee.objects.create(
        issue=issue,
        assignee=user,
        project=issue.project,
        workspace=issue.workspace,
    )
    if deleted:
        link.delete()
    return link


@pytest.mark.unit
@pytest.mark.django_db
def test_live_assignees_ignore_soft_deleted_and_duplicates(slack_context):
    issue = slack_context["issue"]
    user = slack_context["user"]
    user.display_name = "Ada"
    user.save(update_fields=["display_name"])
    stale = User.objects.create(email="stale-assignee@plane.so", username="stale-assignee", display_name="Stale")
    WorkspaceMember.objects.create(workspace=issue.workspace, member=stale, role=20)
    ProjectMember.objects.create(project=issue.project, member=stale, role=20)

    _assign(issue, stale, deleted=True)
    _assign(issue, user, deleted=True)
    _assign(issue, user)

    assert live_assignee_ids(issue) == [str(user.id)]
    assert live_assignee_names(issue) == ["Ada"]

    blocks = issue_card_blocks(issue, "slack-ws", "https://plane.example/issue")
    snapshot = blocks[0]["text"]["text"]
    assert "Assignee: Ada" in snapshot
    assert "Stale" not in snapshot
    assert "Ada, Ada" not in snapshot
    assert "Status:" in snapshot
    assert "Type:" in snapshot
    assert "Priority:" in snapshot


@pytest.mark.unit
@pytest.mark.django_db
def test_notifications_coalesce_assignee_slack_dms(slack_context):
    issue = slack_context["issue"]
    receiver = slack_context["user"]
    actor = User.objects.create(email="assignee-actor@plane.so", username="assignee-actor")
    ProjectMember.objects.create(project=issue.project, member=actor, role=20)
    WorkspaceMember.objects.create(workspace=issue.workspace, member=actor, role=20)
    IssueSubscriber.objects.create(
        issue=issue,
        subscriber=receiver,
        project=issue.project,
        workspace=issue.workspace,
    )
    pref, _ = UserNotificationPreference.objects.get_or_create(user=receiver)
    pref.slack_dm = True
    pref.save(update_fields=["slack_dm"])

    activity = {
        "id": str(uuid4()),
        "verb": "updated",
        "field": "assignees",
        "comment": "added assignee ",
        "actor_id": str(actor.id),
        "new_value": "Ada",
        "old_value": "",
        "issue_comment": None,
        "old_identifier": None,
        "new_identifier": str(receiver.id),
        "issue_detail": {"id": str(issue.id)},
        "created_at": timezone.now().isoformat(),
    }
    activities = json.dumps([dict(activity), dict(activity, id=str(uuid4()), new_value="Grace")])

    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        notifications(
            type="issue.activity.updated",
            issue_id=str(issue.id),
            actor_id=str(actor.id),
            project_id=str(issue.project_id),
            subscriber=False,
            issue_activities_created=activities,
            requested_data=json.dumps({"assignee_ids": [str(receiver.id)]}),
            current_instance=json.dumps({"assignee_ids": []}),
        )
        assert delay.call_count == 1
        headline = delay.call_args.args[2]
        assert headline.startswith(":bell:")
        assert "changed assignee from None → You" in headline


@pytest.mark.unit
def test_slack_headline_state_transition():
    from plane.utils.slack.transitions import PropertyChange

    headline = format_slack_headline(
        "@Ada",
        [PropertyChange(field="state", label="State", old="Todo", new="Done")],
    )
    assert headline == ":bell: @Ada transitioned a task from Todo → Done"


@pytest.mark.unit
def test_slack_headline_deleted_issue():
    from plane.utils.slack.transitions import PropertyChange

    headline = format_slack_headline(
        "@Ada",
        [PropertyChange(field="issue", label="Deleted", kind="notice")],
    )
    assert headline == ":bell: @Ada deleted a task"


@pytest.mark.unit
@pytest.mark.django_db
def test_notification_card_matches_layout(slack_context):
    issue = slack_context["issue"]
    headline = ":bell: @Ada transitioned a task from Todo → Done"
    blocks = issue_card_blocks(
        issue,
        "slack-ws",
        "https://plane.example/issue",
        headline=headline,
        receiver_id=slack_context["user"].id,
    )
    assert blocks[0]["text"]["text"] == headline
    snapshot = blocks[1]["text"]["text"]
    assert "*<https://plane.example/issue|SLK-" in snapshot
    assert "Secret title" in snapshot
    assert "Status: Todo" in snapshot
    assert "Type: None" in snapshot
    assert "Assignee:" in snapshot
    assert "Priority: None" in snapshot


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_dm_gating(slack_context):
    user = slack_context["user"]
    issue = slack_context["issue"]
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = False
    pref.save()
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        _maybe_slack_dm(pref, user.id, user.id, issue, "self", "comment")
        delay.assert_not_called()
        other = User.objects.create(email="actor@plane.so", username="actor")
        _maybe_slack_dm(pref, user.id, other.id, issue, "hi", "comment")
        delay.assert_not_called()
        pref.slack_dm = True
        pref.save()
        _maybe_slack_dm(pref, user.id, other.id, issue, "hi", "comment")
        delay.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_mute_email_when_slack_dm(slack_context):
    user = slack_context["user"]
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = True
    pref.mute_email_when_slack_dm = True
    pref.save()
    assert _mute_email_for_slack(pref, user.id, slack_context["workspace"].id) is True
    pref.mute_email_when_slack_dm = False
    pref.save()
    assert _mute_email_for_slack(pref, user.id, slack_context["workspace"].id) is False


@pytest.mark.unit
@pytest.mark.django_db
def test_post_slack_message_action(slack_context):
    issue = slack_context["issue"]
    with patch("plane.utils.slack.tokens.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        result = execute_post_slack_message(issue, {"channel_id": "C1", "text": "{{name}}"}, slack_context["user"])
        client.chat_postMessage.assert_called()
        assert result["channel_id"] == "C1"


@pytest.mark.unit
@pytest.mark.django_db
def test_unsync_stops_plane_to_slack(slack_context):
    issue = slack_context["issue"]
    link = SlackThreadLink.objects.create(
        workspace_connection=slack_context["connection"],
        issue=issue,
        channel_id="C1",
        thread_ts="1.2",
        sync_enabled=False,
    )
    comment = IssueComment.objects.create(
        issue=issue,
        actor=slack_context["user"],
        comment_html="<p>hi</p>",
        project=issue.project,
        workspace=issue.workspace,
    )
    from plane.bgtasks.slack_task import sync_plane_comment_to_slack

    with patch("plane.bgtasks.slack_task.bot_client") as client:
        sync_plane_comment_to_slack.run(str(comment.id))
        client.assert_not_called()
    link.sync_enabled = True
    link.save()
    with patch("plane.bgtasks.slack_task.bot_client") as client:
        mock = MagicMock()
        client.return_value = mock
        sync_plane_comment_to_slack.run(str(comment.id))
        mock.chat_postMessage.assert_called()
        posted = mock.chat_postMessage.call_args.kwargs["text"]
        assert posted.startswith("<@U123>:")
        assert "hi" in posted


@pytest.mark.unit
@pytest.mark.django_db
def test_plane_comment_sync_uses_display_name_without_slack_link(slack_context):
    issue = slack_context["issue"]
    SlackThreadLink.objects.create(
        workspace_connection=slack_context["connection"],
        issue=issue,
        channel_id="C1",
        thread_ts="1.2",
        sync_enabled=True,
    )
    author = User.objects.create(email="ada@plane.so", username="ada", first_name="Ada")
    comment = IssueComment.objects.create(
        issue=issue,
        actor=author,
        comment_html="<p>from plane</p>",
        project=issue.project,
        workspace=issue.workspace,
    )
    from plane.bgtasks.slack_task import sync_plane_comment_to_slack

    with patch("plane.bgtasks.slack_task.bot_client") as client:
        mock = MagicMock()
        client.return_value = mock
        sync_plane_comment_to_slack.run(str(comment.id))
        posted = mock.chat_postMessage.call_args.kwargs["text"]
    assert posted.startswith("*ada*:")
    assert "from plane" in posted
    assert format_thread_comment_for_slack(comment, slack_context["workspace"].id) == posted


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_thread_reply_maps_linked_user(slack_context):
    with patch("plane.utils.slack.runtime.issue_activity.delay"):
        comment = ingest_slack_thread_reply(
            connection=slack_context["connection"],
            issue=slack_context["issue"],
            slack_user_id="U123",
            text="hello from slack",
            external_id="3.4",
        )
    assert comment is not None
    assert comment.actor_id == slack_context["user"].id
    assert comment.comment_stripped == "hello from slack"
    assert "from Slack" not in comment.comment_html


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_thread_reply_unmapped_user_uses_bot_and_slack_name(slack_context):
    with patch("plane.utils.slack.runtime.issue_activity.delay"), patch(
        "plane.utils.slack.runtime.bot_client"
    ) as bot:
        client = MagicMock()
        client.users_info.return_value = {
            "user": {"name": "jane", "profile": {"display_name": "Jane Doe"}}
        }
        bot.return_value = client
        comment = ingest_slack_thread_reply(
            connection=slack_context["connection"],
            issue=slack_context["issue"],
            slack_user_id="U999",
            text="unmapped reply",
            external_id="9.9",
        )
    assert comment is not None
    assert comment.actor_id == slack_context["connection"].workspace_integration.actor_id
    assert "Jane Doe (from Slack)" in comment.comment_stripped
    assert "unmapped reply" in comment.comment_stripped


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_thread_reply_skips_mapped_user_without_project_access(slack_context):
    outsider = User.objects.create(email="out@plane.so", username="outsider-thread")
    SlackUserConnection.objects.create(
        workspace_connection=slack_context["connection"],
        user=outsider,
        slack_user_id="UOUT2",
    )
    with patch("plane.utils.slack.runtime.issue_activity.delay"):
        comment = ingest_slack_thread_reply(
            connection=slack_context["connection"],
            issue=slack_context["issue"],
            slack_user_id="UOUT2",
            text="should not land",
            external_id="8.8",
        )
    assert comment is None
    assert IssueComment.objects.filter(external_id="8.8").exists() is False


@pytest.mark.unit
@pytest.mark.django_db
def test_deleted_issue_notifies_watchers(slack_context):
    issue = slack_context["issue"]
    watcher = slack_context["user"]
    actor = User.objects.create(email="deleter@plane.so", username="deleter", display_name="Del")
    WorkspaceMember.objects.create(workspace=issue.workspace, member=actor, role=20)
    ProjectMember.objects.create(project=issue.project, member=actor, role=20)
    IssueSubscriber.objects.create(
        issue=issue,
        subscriber=watcher,
        project=issue.project,
        workspace=issue.workspace,
    )
    pref, _ = UserNotificationPreference.objects.get_or_create(user=watcher)
    pref.slack_dm = True
    pref.save(update_fields=["slack_dm"])

    requested = deleted_issue_requested_data(issue)
    issue.delete()
    IssueSubscriber.all_objects.filter(issue_id=issue.id).update(deleted_at=issue.deleted_at)

    activity = {
        "id": str(uuid4()),
        "verb": "deleted",
        "field": "issue",
        "comment": "deleted the issue",
        "actor_id": str(actor.id),
        "new_value": "",
        "old_value": "",
        "issue_comment": None,
        "old_identifier": None,
        "new_identifier": None,
        "issue_detail": None,
        "created_at": timezone.now().isoformat(),
    }
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        notifications(
            type="issue.activity.deleted",
            issue_id=str(issue.id),
            actor_id=str(actor.id),
            project_id=str(issue.project_id),
            subscriber=False,
            issue_activities_created=json.dumps([activity]),
            requested_data=requested,
            current_instance=json.dumps({"name": "Secret title"}),
        )
    notif = Notification.objects.get(receiver=watcher, entity_identifier=issue.id)
    assert notif.data["issue_activity"]["verb"] == "deleted"
    assert notif.data["issue"]["name"] == "Secret title"
    assert delay.call_count == 1
    assert "deleted a task" in delay.call_args.args[2]


@pytest.mark.unit
@pytest.mark.django_db
def test_deleted_issue_slack_dm_is_text_only(slack_context):
    from plane.bgtasks.slack_task import deliver_slack_dm

    issue = slack_context["issue"]
    issue.delete()
    with patch("plane.bgtasks.slack_task.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        deliver_slack_dm.run(
            str(slack_context["user"].id),
            str(issue.id),
            ":bell: @Ada deleted a task",
        )
    kwargs = client.chat_postMessage.call_args.kwargs
    assert "deleted a task" in kwargs["text"]
    assert "(deleted)" in kwargs["text"]
    assert "blocks" not in kwargs


@pytest.mark.unit
@pytest.mark.django_db
def test_issue_activity_serializer_survives_deleted_issue(slack_context):
    from plane.app.serializers.issue import IssueActivitySerializer

    issue = slack_context["issue"]
    issue.delete()
    activity = IssueActivity.objects.create(
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        issue_id=issue.id,
        comment="deleted the issue",
        verb="deleted",
        actor=slack_context["user"],
        field="issue",
        epoch=int(timezone.now().timestamp()),
    )
    data = IssueActivitySerializer(activity).data
    assert str(data["issue_detail"]["id"]) == str(issue.id)
    assert data["verb"] == "deleted"


@pytest.mark.unit
@pytest.mark.django_db
def test_oauth_rejects_team_connected_to_another_workspace(slack_context, create_user):
    other_ws = Workspace.objects.create(name="Other", slug="other-ws", owner=create_user)
    factory = APIRequestFactory()
    from plane.utils.slack.oauth_state import sign_oauth_state

    state = sign_oauth_state({"workspace_slug": other_ws.slug, "user_id": str(create_user.id)})
    request = factory.get("/api/hooks/slack/oauth/workspace", {"code": "x", "state": state})
    with patch(
        "plane.app.views.integration.slack.exchange_oauth_code",
        return_value={"team": {"id": "T1", "name": "Team"}, "access_token": "xoxb-a", "bot_user_id": "B1"},
    ):
        response = SlackWorkspaceOAuthCallbackEndpoint.as_view()(request)
    assert response.status_code == 400
    assert response.data["error"] == "CANNOT_CREATE_MULTIPLE_CONNECTIONS"


@pytest.mark.unit
def test_activity_event_keys_maps_fields_and_custom_properties():
    keys, custom = activity_event_keys(
        [{"field": "assignees", "new_identifier": None}, {"field": "priority", "new_identifier": None}],
        "issue.activity.updated",
    )
    assert keys == {"assignee", "priority"}
    assert custom == set()
    keys, custom = activity_event_keys(
        [{"field": "Severity", "new_identifier": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}],
        "issue_property.activity.updated",
    )
    assert keys == {"custom_property"}
    assert custom == {"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
    keys, _ = activity_event_keys([], "issue.activity.created")
    assert keys == {"create"}


@pytest.mark.unit
def test_events_allowed_core_and_custom():
    assert events_allowed(["create", "state"], ["priority"]) is False
    assert events_allowed(["create", "state"], ["state"]) is True
    assert events_allowed(["state"], {"state", "priority"}) is True
    assert events_allowed([], ["custom_property"], ["p1"], ["p1"]) is True
    assert events_allowed([], ["custom_property"], ["p1"], ["p2"]) is False
    assert events_allowed(["state"], ["custom_property"], ["p1"], allow_all_custom=True) is True


@pytest.mark.unit
@pytest.mark.django_db
def test_subscription_filter_labels_and_type(slack_context):
    issue = slack_context["issue"]
    label = Label.objects.create(
        name="bug",
        project=issue.project,
        workspace=issue.workspace,
    )
    IssueLabel.objects.create(
        issue=issue,
        label=label,
        project=issue.project,
        workspace=issue.workspace,
    )
    assert subscription_matches_issue(issue, {"labels": [str(uuid4())]}) is False
    assert subscription_matches_issue(issue, {"labels": [str(label.id)]}) is True
    assert subscription_matches_issue(issue, {"type": [str(uuid4())]}) is False


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_dm_skips_unselected_property_changes(slack_context):
    user = slack_context["user"]
    issue = slack_context["issue"]
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = True
    pref.slack_dm_events = ["create", "state", "assignee", "comment", "mention"]
    pref.save()
    other = User.objects.create(email="priority-actor@plane.so", username="priority-actor")
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        _maybe_slack_dm(pref, user.id, other.id, issue, "priority changed", "priority")
        delay.assert_not_called()
        _maybe_slack_dm(pref, user.id, other.id, issue, "state changed", "state")
        delay.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_dm_skips_custom_property_unless_enabled(slack_context):
    user = slack_context["user"]
    issue = slack_context["issue"]
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = True
    pref.slack_dm_custom_properties = False
    pref.save()
    other = User.objects.create(email="prop-actor@plane.so", username="prop-actor")
    prop_id = str(uuid4())
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        _maybe_slack_dm(
            pref,
            user.id,
            other.id,
            issue,
            "custom",
            "Severity",
            event_keys={"custom_property"},
            custom_property_ids=[prop_id],
            activity_type="issue_property.activity.updated",
        )
        delay.assert_not_called()
        pref.slack_dm_custom_properties = True
        pref.save(update_fields=["slack_dm_custom_properties"])
        _maybe_slack_dm(
            pref,
            user.id,
            other.id,
            issue,
            "custom",
            "Severity",
            event_keys={"custom_property"},
            custom_property_ids=[prop_id],
            activity_type="issue_property.activity.updated",
        )
        delay.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_dm_priority_filter(slack_context):
    user = slack_context["user"]
    issue = slack_context["issue"]
    issue.priority = "low"
    issue.save(update_fields=["priority"])
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = True
    pref.slack_dm_events = ["state"]
    pref.slack_dm_filter = {"priority": ["high"]}
    pref.save()
    other = User.objects.create(email="filter-actor@plane.so", username="filter-actor")
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        _maybe_slack_dm(pref, user.id, other.id, issue, "state", "state")
        delay.assert_not_called()
        pref.slack_dm_filter = {"priority": ["low"]}
        pref.save(update_fields=["slack_dm_filter"])
        _maybe_slack_dm(pref, user.id, other.id, issue, "state", "state")
        delay.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_channel_skips_unselected_event(slack_context):
    from plane.bgtasks.slack_task import deliver_slack_channel

    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=slack_context["project"],
        workspace=slack_context["project"].workspace,
        channel_id="C-events",
        events=["create", "state"],
        public_channel_ack=True,
    )
    with patch("plane.bgtasks.slack_task.bot_client") as client:
        deliver_slack_channel.run(str(sub.id), str(slack_context["issue"].id), "priority", "priority")
        client.assert_not_called()
        deliver_slack_channel.run(str(sub.id), str(slack_context["issue"].id), ["state", "priority"], "state")
        client.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_channel_custom_property_event_and_filter(slack_context):
    from plane.bgtasks.slack_task import deliver_slack_channel

    prop_id = str(uuid4())
    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=slack_context["project"],
        workspace=slack_context["project"].workspace,
        channel_id="C-custom",
        events=[],
        custom_property_ids=[prop_id],
        public_channel_ack=True,
    )
    with patch("plane.bgtasks.slack_task.bot_client") as client:
        deliver_slack_channel.run(
            str(sub.id),
            str(slack_context["issue"].id),
            ["custom_property"],
            "custom",
            [prop_id],
        )
        client.assert_called()
        client.reset_mock()
        deliver_slack_channel.run(
            str(sub.id),
            str(slack_context["issue"].id),
            ["custom_property"],
            "custom",
            [str(uuid4())],
        )
        client.assert_not_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_slack_dm_skips_mention_when_unselected(slack_context):
    user = slack_context["user"]
    issue = slack_context["issue"]
    pref, _ = UserNotificationPreference.objects.get_or_create(user=user)
    pref.slack_dm = True
    pref.slack_dm_events = ["create", "state", "assignee", "comment"]
    pref.save()
    other = User.objects.create(email="mention-actor@plane.so", username="mention-actor")
    with patch("plane.bgtasks.slack_task.deliver_slack_dm.delay") as delay:
        _maybe_slack_dm(pref, user.id, other.id, issue, "mentioned you", "mention", event_keys={"mention"})
        delay.assert_not_called()
        pref.slack_dm_events = ["mention"]
        pref.save(update_fields=["slack_dm_events"])
        _maybe_slack_dm(pref, user.id, other.id, issue, "mentioned you", "mention", event_keys={"mention"})
        delay.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_subscription_filter_custom_property_values(slack_context):
    issue = slack_context["issue"]
    issue_type = IssueType.objects.create(
        workspace=issue.workspace,
        name="Task",
        is_epic=False,
        is_default=True,
        is_active=True,
    )
    prop = IssueProperty.objects.create(
        workspace=issue.workspace,
        project=issue.project,
        issue_type=issue_type,
        name="Severity",
        property_type=IssuePropertyType.TEXT,
        is_active=True,
    )
    IssuePropertyValue.objects.create(
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        property=prop,
        value_text="Critical",
    )
    assert subscription_matches_issue(issue, {"custom_properties": {str(prop.id): ["Low"]}}) is False
    assert subscription_matches_issue(issue, {"custom_properties": {str(prop.id): ["Critical"]}}) is True


@pytest.mark.unit
@pytest.mark.django_db
def test_channel_custom_only_skips_state_and_unmatched_filter(slack_context):
    from plane.bgtasks.slack_task import deliver_slack_channel

    issue = slack_context["issue"]
    issue_type = IssueType.objects.create(
        workspace=issue.workspace,
        name="Bug",
        is_epic=False,
        is_default=False,
        is_active=True,
    )
    prop = IssueProperty.objects.create(
        workspace=issue.workspace,
        project=issue.project,
        issue_type=issue_type,
        name="Team",
        property_type=IssuePropertyType.TEXT,
        is_active=True,
    )
    IssuePropertyValue.objects.create(
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        property=prop,
        value_text="Platform",
    )
    prop_id = str(prop.id)
    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=slack_context["project"],
        workspace=slack_context["project"].workspace,
        channel_id="C-custom-only",
        events=[],
        custom_property_ids=[prop_id],
        filter_payload={"custom_properties": {prop_id: ["Platform"]}},
        public_channel_ack=True,
    )
    with patch("plane.bgtasks.slack_task.bot_client") as client:
        deliver_slack_channel.run(str(sub.id), str(issue.id), "state", "state")
        client.assert_not_called()
        sub.filter_payload = {"custom_properties": {prop_id: ["Design"]}}
        sub.save()
        deliver_slack_channel.run(str(sub.id), str(issue.id), ["custom_property"], "custom", [prop_id])
        client.assert_not_called()
        sub.filter_payload = {"custom_properties": {prop_id: ["Platform"]}}
        sub.save()
        deliver_slack_channel.run(str(sub.id), str(issue.id), ["custom_property"], "custom", [prop_id])
        client.assert_called()


@pytest.mark.unit
def test_parse_slash_create_type_and_summary():
    assert parse_slash_create_args("") == ("", "")
    assert parse_slash_create_args("create") == ("", "")
    assert parse_slash_create_args("create Fix login") == ("", "Fix login")
    assert parse_slash_create_args("create Bug Fix login", {"Bug"}) == ("Bug", "Fix login")
    assert parse_slash_create_args("bug Fix login", {"Bug"}) == ("Bug", "Fix login")
    assert should_open_create_modal("")
    assert should_open_create_modal("create Bug title")
    assert should_open_create_modal("Fix the login")
    assert not should_open_create_modal("help")
    assert not should_open_create_modal("manage")
    assert not should_open_create_modal("SLK-12")
    assert should_open_manage_modal("manage")
    assert should_open_manage_modal("connect")
    assert not should_open_manage_modal("create")


@pytest.mark.unit
@pytest.mark.django_db
def test_slash_create_prefills_type_and_summary(slack_context):
    IssueType.objects.create(
        workspace=slack_context["workspace"],
        name="Bug",
        is_epic=False,
        is_default=False,
        is_active=True,
    )
    with patch("plane.utils.slack.handlers.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        handle_slash(
            slack_context["connection"],
            {"user_id": "U123", "channel_id": "C1", "text": "create Bug Fix login", "trigger_id": "trig"},
        )
        view = client.views_open.call_args.kwargs["view"]
        metadata = json.loads(view["private_metadata"])
        assert metadata["prefill"] == "Fix login"
        assert metadata["type_hint"] == "Bug"


@pytest.mark.unit
@pytest.mark.django_db
def test_create_modal_applies_type_hint_and_prefill(slack_context):
    project = slack_context["project"]
    issue_type = IssueType.objects.create(
        workspace=slack_context["workspace"],
        name="Bug",
        is_epic=False,
        is_default=False,
        is_active=True,
    )
    ProjectIssueType.objects.create(
        project=project, issue_type=issue_type, workspace=slack_context["workspace"], is_default=False
    )
    result = view_submission_response(
        slack_context["connection"],
        {
            "user": {"id": "U123"},
            "view": {
                "callback_id": "project_selection",
                "private_metadata": json.dumps({"channel_id": "C1", "prefill": "Fix login", "type_hint": "Bug"}),
                "state": {
                    "values": {"project": {"project": {"selected_option": {"value": str(project.id)}}}}
                },
            },
        },
    )
    assert result["response_action"] == "update"
    type_block = next(block for block in result["view"]["blocks"] if block.get("block_id") == "type")
    assert type_block["element"]["initial_option"]["value"] == str(issue_type.id)
    title_block = next(block for block in result["view"]["blocks"] if block.get("block_id") == "title")
    assert title_block["element"]["initial_value"] == "Fix login"


@pytest.mark.unit
@pytest.mark.django_db
def test_create_issue_from_slack_sets_type(slack_context):
    issue_type = IssueType.objects.create(
        workspace=slack_context["workspace"],
        name="Bug",
        is_epic=False,
        is_default=False,
        is_active=True,
    )
    issue = create_issue_from_slack(
        project=slack_context["project"],
        user=slack_context["user"],
        title="Typed",
        type_id=issue_type.id,
    )
    assert issue.type_id == issue_type.id


@pytest.mark.unit
@pytest.mark.django_db
def test_link_thread_shortcut_and_unsync(slack_context):
    issue = slack_context["issue"]
    key = f"{issue.project.identifier}-{issue.sequence_id}"
    connection = slack_context["connection"]
    with patch("plane.utils.slack.handlers.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        handle_message_action(
            connection,
            {
                "callback_id": "link_work_item",
                "user": {"id": "U123"},
                "channel": {"id": "C9"},
                "trigger_id": "trig",
                "message": {"ts": "10.1", "text": f"see {key}"},
            },
        )
        opened = client.views_open.call_args.kwargs["view"]
        assert opened["callback_id"] == "link_thread"
        result = view_submission_response(
            connection,
            {
                "user": {"id": "U123"},
                "view": {
                    "callback_id": "link_thread",
                    "private_metadata": json.dumps({"channel_id": "C9", "thread_ts": "10.1"}),
                    "state": {"values": {"issue_key": {"issue_key": {"value": key}}}},
                },
            },
        )
        assert result["response_action"] == "clear"
        link = SlackThreadLink.objects.get(channel_id="C9", thread_ts="10.1")
        assert link.issue_id == issue.id
        assert link.sync_enabled is True
        handle_block_actions(
            connection,
            {
                "user": {"id": "U123"},
                "channel": {"id": "C9"},
                "message": {"ts": "10.1"},
                "actions": [
                    {
                        "action_id": "issue_overflow",
                        "selected_option": {"value": f"unsync:{issue.id}"},
                    }
                ],
            },
        )
        link.refresh_from_db()
        assert link.sync_enabled is False


@pytest.mark.unit
@pytest.mark.django_db
def test_issue_card_includes_unsync_overflow(slack_context):
    blocks = issue_card_blocks(slack_context["issue"], "slack-ws", "https://plane.example/issue")
    overflow = next(el for el in blocks[-1]["elements"] if el.get("action_id") == "issue_overflow")
    values = [opt["value"] for opt in overflow["options"]]
    assert any(value.startswith("unsync:") for value in values)


@pytest.mark.unit
@pytest.mark.django_db
def test_manage_subscription_pause_and_disconnect(slack_context):
    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=slack_context["project"],
        workspace=slack_context["workspace"],
        channel_id="C-manage",
        events=["create", "state", "assignee", "comment"],
        public_channel_ack=True,
    )
    with patch("plane.utils.slack.handlers.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        handle_block_actions(
            slack_context["connection"],
            {
                "user": {"id": "U123"},
                "view": {"id": "V1", "private_metadata": json.dumps({"channel_id": "C-manage"})},
                "actions": [
                    {
                        "action_id": "manage_subscription",
                        "selected_option": {"value": f"pause:{sub.id}"},
                    }
                ],
            },
        )
        sub.refresh_from_db()
        assert sub.is_paused is True
        handle_block_actions(
            slack_context["connection"],
            {
                "user": {"id": "U123"},
                "view": {"id": "V1", "private_metadata": json.dumps({"channel_id": "C-manage"})},
                "actions": [
                    {
                        "action_id": "manage_subscription",
                        "selected_option": {"value": f"disconnect:{sub.id}"},
                    }
                ],
            },
        )
        assert not SlackChannelSubscription.objects.filter(pk=sub.id).exists()
        client.views_update.assert_called()


@pytest.mark.unit
@pytest.mark.django_db
def test_manage_add_subscription_from_modal(slack_context):
    with patch("plane.utils.slack.handlers.resolve_slack_channel", return_value={"id": "C-add", "name": "alerts", "is_private": False}):
        result = view_submission_response(
            slack_context["connection"],
            {
                "user": {"id": "U123"},
                "view": {
                    "callback_id": "channel_manage",
                    "private_metadata": json.dumps({"channel_id": "C-add"}),
                    "state": {
                        "values": {
                            "project": {
                                "project": {"selected_option": {"value": str(slack_context["project"].id)}}
                            },
                            "public_ack": {"public_ack": {"selected_options": []}},
                        }
                    },
                },
            },
        )
    assert result["response_action"] == "update"
    assert SlackChannelSubscription.objects.filter(
        channel_id="C-add", project=slack_context["project"]
    ).exists()


@pytest.mark.unit
@pytest.mark.django_db
def test_channel_coalesces_burst_into_digest(slack_context):
    from plane.bgtasks.slack_task import deliver_slack_channel, flush_slack_channel_digest

    cache.clear()
    issue = slack_context["issue"]
    sub = SlackChannelSubscription.objects.create(
        workspace_connection=slack_context["connection"],
        project=slack_context["project"],
        workspace=slack_context["workspace"],
        channel_id="C-digest",
        events=["create", "state", "assignee", "comment"],
        public_channel_ack=True,
    )
    with patch("plane.bgtasks.slack_task.bot_client") as bot, patch(
        "plane.bgtasks.slack_task.flush_slack_channel_digest.apply_async"
    ) as apply_async:
        client = MagicMock()
        bot.return_value = client
        deliver_slack_channel.run(str(sub.id), str(issue.id), "create", "first")
        assert client.chat_postMessage.call_count == 1
        deliver_slack_channel.run(str(sub.id), str(issue.id), "state", "second")
        assert client.chat_postMessage.call_count == 1
        apply_async.assert_called()
    with patch("plane.bgtasks.slack_task.bot_client") as bot:
        client = MagicMock()
        bot.return_value = client
        flush_slack_channel_digest.run(str(sub.id))
        client.chat_postMessage.assert_called_once()
        assert "second" in client.chat_postMessage.call_args.kwargs["text"]

