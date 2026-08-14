# Capability matrix — Jira Slack × Silo × CE × stage

Owner: API = Django/Celery, worker = Slack Celery handlers, web = Plane settings UI, slack-ui = Block Kit in Slack.

| Jira feature                                     | Silo (`9b641e6407`)                       | CE today                           | Wave                 | Owner            |
| ------------------------------------------------ | ----------------------------------------- | ---------------------------------- | -------------------- | ---------------- |
| Slack App Directory / BYO app install            | Dual OAuth (bot + user)                   | Orphan UI; GitHub-only install API | W1.5, W1.6           | API, web         |
| Site-admin enable / instance secrets             | EE Silo env                               | `SLACK_CLIENT_ID` only             | W1.1                 | API              |
| Signing + 3s ack + queue                         | Silo workers                              | None                               | W1.3, W1.4           | API, worker      |
| Encrypted tokens + refresh lock                  | Refresh yes; plaintext DB                 | None                               | W1.2, W1.3           | API              |
| One Slack team ↔ one Plane workspace             | True (duplicate rejected)                 | N/A                                | W1.5                 | API              |
| Invite bot to private channels                   | Implicit                                  | None                               | W1.5 (docs)          | slack-ui         |
| `/jira create` modal                             | `/plane` opens create modal; ignores text | None                               | W2.1                 | worker           |
| `/jira create [type] [summary]`                  | False                                     | None                               | W7.2                 | worker           |
| Message shortcut create work item                | `issue_shortcut`                          | None                               | W2.2                 | worker           |
| Message shortcut create intake                   | `create_intake_issue`                     | None                               | W2.2                 | worker           |
| Connect-gate for unmapped user                   | True                                      | None                               | W1.6 copy, W2.1      | web, worker      |
| URL unfurl issue                                 | `issue-linkback.ts`                       | None                               | W3.1                 | worker           |
| URL unfurl project/cycle/module/page             | Yes                                       | None                               | W3.1                 | worker           |
| URL unfurl intake                                | Create card only, not URL                 | None                               | W7.9                 | worker           |
| Key unfurl `PROJ-123` (uppercase)                | **False**                                 | Identifier endpoint exists         | W3.2                 | worker           |
| `/jira [KEY]` ephemeral                          | False                                     | None                               | W7.2                 | worker           |
| Card: comment                                    | True                                      | None                               | W3.1                 | worker           |
| Card: state / priority                           | True (some overflow deprecated)           | None                               | W3.1                 | worker           |
| Card: assign / assign-to-me                      | True                                      | None                               | W3.1                 | worker           |
| Card: watch/unwatch                              | **False**                                 | `IssueSubscriber` APIs             | W7.4                 | worker           |
| Card: open in Plane                              | True                                      | None                               | W3.1                 | worker           |
| Live thread sync Slack→Plane                     | `handleMessageEvent`                      | `external_id` unused               | W4                   | worker           |
| Live thread sync Plane→Slack                     | comment + issue webhooks                  | None                               | W4                   | worker           |
| Thread unsync                                    | Delete entity connection                  | None                               | W4                   | worker           |
| Thread backfill                                  | **False**                                 | None                               | W7.5                 | worker           |
| Enable sync on create                            | Checkbox in modal                         | None                               | W2.1, W4             | worker           |
| Link existing thread                             | `link_work_item` shortcut                 | None                               | W4                   | worker           |
| Personal DMs (assigned, mention, comment, state) | Assignee + mention only; one boolean      | Email-class prefs exist            | W5                   | API, worker      |
| DM Essentials vs All / filters                   | **False**                                 | None                               | W7.2 `/notify`, W7.6 | worker, web      |
| Mute email when Slack on                         | **False**                                 | Email prefs                        | W7.6                 | API, web         |
| Channel sub: create only                         | True                                      | i18n copy only                     | W6                   | API, web, worker |
| Channel sub: state, assignee, comment            | **False**                                 | None                               | W6                   | API, worker      |
| `/jira connect` `/jira manage` pause             | **False** (web settings only)             | None                               | W6, W7.2             | worker, web      |
| Channel filters + multi-sub (JQL analogue)       | **False**                                 | Rich-filters in Plane              | W7.1                 | API, web, worker |
| Coalesce 1 msg/s                                 | Unknown                                   | None                               | W6                   | worker           |
| Private project → public channel deny            | Partial permissions                       | Guest rules                        | W6                   | API              |
| App Home assigned + watching                     | **False**                                 | None                               | W7.3                 | worker           |
| Slash suite help/logout/unsubscribe              | **False**                                 | None                               | W7.2                 | worker           |
| Invite teammates from Slack                      | **False**                                 | `WorkspaceInviteLink`              | W7.7                 | API, worker      |
| Audit log installs/revokes/subs                  | **False**                                 | None                               | W7.8                 | API              |
| Required custom properties on create             | Partial Silo fields                       | Custom properties exist            | W7.9                 | worker           |
| Compact vs detailed cards                        | Partial                                   | None                               | W7 (with Home)       | worker           |
| `@Jira` / Rovo AI                                | **False**                                 | LLM instance flag                  | W8.2                 | worker           |
| `/jira agent` channel default                    | **False**                                 | None                               | W8.4                 | worker           |
| Automation post to Slack                         | **False**                                 | Automations issue-internal         | W8.3                 | API              |
| Emoji-reaction create                            | **False**                                 | None                               | W8.4                 | worker           |
| Multi-workspace picker                           | **False** (forbidden)                     | N/A                                | W8.4                 | API              |
| Socket Mode                                      | N/A                                       | VPS has public HTTPS               | W8.1 skip here       | API              |
| Incoming Webhooks as product                     | Unused then removed                       | Dead `slackChannel` popup          | never                | —                |
| Discord / Teams                                  | Absent                                    | Absent                             | out of scope         | —                |

## MVP vs near vs later

- **MVP:** W1–W6 + D1 + D-MVP (create, URL+key unfurl, actions, live thread sync, email-class DMs, multi-event channel subs).
- **Near:** W7.\*
- **Later:** W8.\* (`W8.1` skip on plane.teamcodeorange.com).
