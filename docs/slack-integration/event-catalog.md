# Event catalog — Plane activity → Slack

Skip in MVP (matches CE email): description-only edits, reactions, votes, draft/intake activity, cycle/module membership.

Preference gates are `UserNotificationPreference` booleans. W5 adds `slack_dm` (or per-event `{email, slack}` later). Actor is never notified.

| Activity type                                  | Typical `field`                                                                                     | In-app?                                   | Email pref        | DM (W5)                               | Channel (W6)    | Template           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------- | ------------------------------------- | --------------- | ------------------ |
| `issue.activity.created`                       | —                                                                                                   | Yes (created/assigned/subscribed)         | n/a (create)      | If assignee or subscriber + slack on  | `create`        | New work item card |
| `issue.activity.updated`                       | `state` (not completed)                                                                             | Yes                                       | `state_change`    | Same                                  | `state`         | State change       |
| `issue.activity.updated`                       | `state` → completed group                                                                           | Yes                                       | `issue_completed` | Same                                  | `state`         | Completed          |
| `issue.activity.updated`                       | `assignees`                                                                                         | Yes                                       | `property_change` | Assignee add/remove                   | `assignee`      | Assignee change    |
| `issue.activity.updated`                       | `priority`, `name`, `labels`, dates, type, parent, estimate, link, attachment, relation, github\_\* | Yes                                       | `property_change` | Optional (MVP: skip except assignees) | skip MVP        | —                  |
| `issue.activity.updated`                       | `description`                                                                                       | **No**                                    | skip              | skip                                  | skip            | —                  |
| `issue.activity.deleted`                       | `issue`                                                                                             | Yes                                       | `property_change` | skip MVP                              | skip MVP        | —                  |
| `comment.activity.created`                     | `comment`                                                                                           | Yes                                       | `comment`         | Yes                                   | `comment`       | Comment            |
| `comment.activity.updated/deleted`             | `comment`                                                                                           | Yes                                       | `comment`         | skip MVP                              | skip MVP        | —                  |
| mention (synthetic)                            | `mention`                                                                                           | Yes (`in_app:issue_activities:mentioned`) | `mention`         | Yes                                   | skip (personal) | Mention            |
| `issue_property.activity.updated`              | custom name                                                                                         | Yes                                       | `property_change` | skip MVP                              | skip MVP        | —                  |
| `cycle.activity.*` / `module.activity.*`       | cycles, modules                                                                                     | **No**                                    | skip              | skip                                  | skip            | —                  |
| `issue_reaction` / `comment_reaction` / `vote` | —                                                                                                   | **No**                                    | skip              | skip                                  | skip            | —                  |
| `issue_draft.*` / `intake.activity.*`          | —                                                                                                   | **No**                                    | skip              | skip                                  | skip            | —                  |

## Recipients (do not re-derive)

`notifications()` already computes: creator, assignees, `IssueSubscriber`, description/comment mentions, minus actor, intersect active `ProjectMember`.

DMs: those receivers with a `SlackUserConnection` and slack delivery enabled.

Channel: `SlackChannelSubscription` for the project, not paused, event in `{create, state, assignee, comment}`, authz: subscription creator or workspace bot still a project member; private project → public channel requires `public_channel_ack`.

## Silo vs this catalog

Silo DMs: assignee add/remove, comment mention, description mention; one `isEnabled`. Channel: create only (`action === CREATED && activity.field == null`). This catalog is the email-class bar, not Silo’s narrower set.
