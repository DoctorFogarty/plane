# Slack ↔ Plane — core context

Shared facts for every agent. Do not implement from this file alone. Open your stage brief next.

## Product bar

Near-Jira Slack means a Slack **App** (Events API + interactivity + slash + unfurls), not Incoming Webhooks. Classic Jira Slack (create, unfurl, actions, DMs, channel subs, thread sync, Home, admin) is the bar. `@Plane` AI is Wave 8.

## Architecture (locked)

- **This repo:** in-API Slack (Django + Celery + pinned `slack-sdk`). Follow GitHub `WorkspaceIntegration` (bot user + service APIToken).
- **Do not** git-restore `apps/silo`. Spec only: commit `9b641e6407`, branch `fix/comments-mention`.
- **Do not** reuse `SlackProjectSync` (webhook-era, unique team+project).
- **Do not** use Incoming Webhooks or the automation engine as the notification bus.
- **Cloud vs CE:** CE is bring-your-own Slack app. This checkout’s live host is `https://plane.teamcodeorange.com` (public HTTPS). **W8.1 Socket Mode is skipped** on this host.

## Hard rules

- One stage per agent. Do not start the next stage.
- Mutations as the **mapped Plane user**. Unfurl/DM/channel post must pass the same authz as `GET` on the work item.
- Never leak work-item titles on 403 unfurls (ephemeral “no access”).
- Private project → public Slack channel: default **deny** unless an admin acknowledges.
- Do not auto-link Slack users by email alone (OAuth required).
- Do not commit, push, or open PRs unless the user asks.
- Never print VPS/cPanel/Slack client secrets in chat. Put them in God Mode / VPS `plane.env`.
- Tests required for implementation stages. New logic without tests is not done.

## Reuse (do not rebuild)

| Primitive             | Path                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifier `PROJ-123` | `IssueDetailIdentifierEndpoint`; regex `\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b`                                                                                       |
| Recipients            | `IssueSubscriber` + `notification_task.py` mentions                                                                                                             |
| Prefs                 | `UserNotificationPreference` (`property_change`, `state_change`, `comment`, `mention`, `issue_completed`) — add a Slack channel key; do not invent a second bus |
| Thread comments       | `IssueComment.external_source` / `external_id` (Silo used `SLACK_COMMENT`)                                                                                      |
| Install pattern       | `WorkspaceIntegration` + GitHub flow in `apps/api/plane/app/views/integration/base.py`                                                                          |
| Invites (W7.7)        | `WorkspaceInviteLink`                                                                                                                                           |
| Ingress pattern       | GitHub `apps/api/plane/app/views/integration/webhook.py`                                                                                                        |

Skip notifying (MVP, matches email): description-only, reactions, votes, draft/intake activity, cycle/module membership.

## Data model (replace SlackProjectSync)

| Entity                                     | Purpose                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `SlackWorkspaceConnection`                 | Slack `team_id` ↔ Plane workspace; bot token + refresh; bot user id; scopes          |
| `SlackUserConnection`                      | Slack `user_id` ↔ Plane user; user token + refresh                                   |
| `SlackChannelSubscription`                 | channel ↔ project; event set; filter payload; paused; **not** unique on team+project |
| `SlackThreadLink`                          | `channel_id` + `thread_ts` ↔ issue; sync enabled                                     |
| Slack flag on `UserNotificationPreference` | DM delivery channel                                                                  |

Exact fields are locked in [contracts.md](./contracts.md) (W0.3).

## Slack platform constraints

- Ack Events/interactivity in **3 seconds**; queue the work. Idempotent on `event_id`.
- `trigger_id` for `views.open` expires in ~3 seconds — open modal before Plane API calls.
- **1 message per second per channel** — coalesce channel bursts.
- Block Kit option text **75 chars**.
- Token rotation ~12h; refresh token **rotates**; single-flight lock or `invalid_grant`.
- Private channels: bot must be invited; need history scopes for thread sync.
- Verify signing secret on every HTTP ingress.

## Instance / VPS

- Public app: `https://plane.teamcodeorange.com`
- SSH: `plane-vps` → `/opt/plane-selfhost` (restart only via `sudo ./setup.sh start|restart`)
- Request URL (lock in W0.3, default): `https://plane.teamcodeorange.com/api/hooks/slack/events`
- OAuth redirect (lock in W0.3): under `/api/hooks/slack/oauth/`
- Instance keys: `SLACK_CLIENT_ID` (already public), **add** `SLACK_CLIENT_SECRET`, signing secret. Never expose secrets on `GET /api/instances/`.
- Deploy skill: `.claude/skills/validate-and-deploy-vps/SKILL.md`
- W1.1–W1.3: pytest only. **W1.4 onward:** validate, build `linux/amd64` `:local` images, deploy, smoke `/`, `/god-mode/`, `/api/instances/` (expect 200). Unsigned Slack ingress expect 401.

## Web UI skills (when touching `apps/web`)

- **Plane, not a new brand.** Same density as GitHub integration / members settings. Copy: “Connect Slack”, “Disconnect workspace”, “Link your Slack account”. Empty and error states say what to do next.
- Vercel React: no barrel imports; SWR; no client secrets; lazy-load Slack-only panels; no fetch waterfalls.

## Silo (spec only)

Snapshot `9b641e6407`. Had: dual OAuth, `/plane` create modal only (ignores text), shortcuts (work item, intake, link thread), URL unfurls (issue/project/cycle/module/page), live thread sync **without backfill**, create-only channel posts, mention/assignee DMs with one boolean. Did **not** have: key unfurl, App Home, watch, slash suite, thread backfill, Incoming Webhook runtime.

## Notification architecture

- **DMs:** extend `notifications()` in `apps/api/plane/bgtasks/notification_task.py`.
- **Channel posts:** `SlackChannelSubscription` matcher on the same activity — do not dump all webhooks to Slack.

## Waves

0 specs → 1 foundation → D1 deploy → 2 create / 3 unfurl / 4 threads / 5 DMs → 6 channel subs → D-MVP → 7 near-parity → 8 later.

Parallel after D1: W2.1 with W5. W6 only after W4 **and** W5.
