# Slack integration contracts

`SlackProjectSync` is **deprecated / unused**. Do not write new rows. Leave the table in place.

## Instance configuration

| Key                    | Encrypted | Public on `GET /api/instances/` |
| ---------------------- | --------- | ------------------------------- |
| `SLACK_CLIENT_ID`      | no        | yes (`config.slack_client_id`)  |
| `SLACK_CLIENT_SECRET`  | yes       | **no**                          |
| `SLACK_SIGNING_SECRET` | yes       | **no**                          |
| `SLACK_APP_TOKEN`      | yes       | **no** (W8.1 Socket Mode only)  |

Category: `SLACK`. Add to `instance_config_variables`.

## Public URLs (this VPS)

Base: `https://plane.teamcodeorange.com`

| Purpose                  | Path                                   |
| ------------------------ | -------------------------------------- |
| Events                   | `POST /api/hooks/slack/events`         |
| Interactivity            | `POST /api/hooks/slack/interactive`    |
| Slash commands           | `POST /api/hooks/slack/commands`       |
| Workspace OAuth callback | `GET /api/hooks/slack/oauth/workspace` |
| User OAuth callback      | `GET /api/hooks/slack/oauth/user`      |

Slack app Request URL = events path. Interactivity Request URL = interactive path. Redirect URLs = both OAuth callbacks.

## Models

### SlackWorkspaceConnection (`slack_workspace_connections`)

Workspace-scoped (`Workspace` FK). Unique `team_id` globally (one Slack team ↔ one Plane workspace). Unique `(workspace, team_id)`.

- `workspace` FK
- `workspace_integration` FK to `WorkspaceIntegration`
- `team_id`, `team_name`
- `bot_user_id`, `bot_access_token` (encrypted TextField), `bot_refresh_token` (encrypted, nullable)
- `token_expires_at` (nullable)
- `scopes` TextField
- `installed_by` FK User nullable
- `is_enabled` bool default True
- `app_uninstalled_at` nullable

### SlackUserConnection (`slack_user_connections`)

Unique `(workspace_connection, slack_user_id)` and `(workspace_connection, user)`.

- `workspace_connection` FK
- `user` FK
- `slack_user_id`, `slack_email` (email at link time, informational)
- `user_access_token` encrypted, `user_refresh_token` encrypted nullable
- `token_expires_at` nullable
- `scopes` TextField

### SlackChannelSubscription (`slack_channel_subscriptions`)

**Not** unique on team+project. Unique `(workspace_connection, channel_id, project)` for MVP (W7.1 adds filter hash for multi-sub).

- `workspace_connection` FK
- `project` FK
- `channel_id`, `channel_name`
- `is_private_channel` bool
- `events` JSON list default `["create","state","assignee","comment"]`
- `filter_payload` JSON default `{}` (W7.1)
- `is_paused` bool
- `public_channel_ack` bool default False (required if project is secret and channel is public)
- `created_by` FK User
- `last_posted_at` nullable (coalesce)

### SlackThreadLink (`slack_thread_links`)

Unique `(channel_id, thread_ts)`.

- `workspace_connection` FK
- `issue` FK
- `channel_id`, `thread_ts`
- `sync_enabled` bool
- `created_from` CharField (`create` \| `link` \| `unfurl`)

### UserNotificationPreference

Add `slack_dm` BooleanField default True (W5). Existing booleans still gate event types.

### SlackEventIdempotency (`slack_event_idempotency`) optional

- `event_id` unique CharField
- `created_at`
- TTL via cleanup or unique constraint is enough for retries

### SlackAuditLog (W7.8)

- workspace, actor, action, metadata JSON

## Encrypted token helpers

Use `plane.license.utils.encryption.encrypt_data` / `decrypt_data`. Never log token values. Refresh: single-flight lock keyed by connection id (Django cache lock or `select_for_update`). Persist **new** refresh token every rotation.

## HTTP ingress

- `AllowAny`, no session auth.
- Verify `X-Slack-Signature` + `X-Slack-Request-Timestamp` (reject |now-ts| > 300s).
- `url_verification`: return `{"challenge": ...}` 200 immediately.
- Else enqueue Celery, return 200 (not 202 delayed — Slack wants 200 quickly). Idempotent on `event_id` / `payload.container` id.
- Unsigned: 401.

## OAuth

- Workspace: bot scopes from CONTEXT. State = signed `{workspace_slug, nonce}`.
- User: user scopes; state includes Plane user id.
- Duplicate `team_id` already connected to another workspace: 400 `CANNOT_CREATE_MULTIPLE_CONNECTIONS`.
- `app_uninstalled` / `tokens_revoked`: disable connection, clear tokens.
- No email-only auto-link.

## WorkspaceIntegration

`POST .../workspace-integrations/slack/` allowed (today GitHub-only). Creates bot User + APIToken like GitHub. Catalog `Integration.provider="slack"` `verified=True`.

## Threat mitigations

See CONTEXT. Unfurl IDOR: 403 ephemeral without title. Channel leak: `public_channel_ack`. Signing secret on all ingress. Secrets not in public instance config.

## Deploy modes

| Host                     | Transport          |
| ------------------------ | ------------------ |
| plane.teamcodeorange.com | HTTP Events API    |
| Air-gapped CE            | Socket Mode (W8.1) |

## Celery

- `plane.bgtasks.slack_task.process_slack_event`
- `plane.bgtasks.slack_task.process_slack_interaction`
- `plane.bgtasks.slack_task.process_slack_command`
- `plane.bgtasks.slack_task.refresh_slack_token` (internal)
- Outbound: `deliver_slack_dm`, `deliver_slack_channel` (W5/W6)
