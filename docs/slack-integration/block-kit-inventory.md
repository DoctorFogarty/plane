# Block Kit inventory (Silo `9b641e6407` + MVP target)

Option text **75 characters** (Silo truncated). Do not exceed Slack modal/block caps.

## Connect gate (ephemeral)

- Text: connect Plane account to use this feature.
- Button: Connect (OAuth URL from W1.5 user flow).

## Project selection modal

- Trigger: `/plane` or shortcut before full form.
- Select: member projects only (`is_member`).
- Private metadata: `{ type: command_project_selection | shortcut_project_selection, channel_id, response_url, message? }`.

## Create work item modal (`issue-modal-full`)

Actions / block ids from Silo `ACTIONS`:

| Action                        | Field                       |
| ----------------------------- | --------------------------- |
| `ISSUE_OBJECT_TYPE_SELECTION` | work_item vs intake (W2.2)  |
| `ISSUE_TITLE`                 | title (required)            |
| `ISSUE_DESCRIPTION`           | description                 |
| `ISSUE_TYPE`                  | issue type                  |
| `ISSUE_STATE`                 | state                       |
| `ISSUE_PRIORITY`              | urgent/high/medium/low/none |
| `ISSUE_LABELS`                | multi-select, 75-char names |
| `ENABLE_THREAD_SYNC`          | checkbox (W4)               |

Intake (non-work-item): title, description, priority only.

Open with `views.open` using `trigger_id` **before** any Plane list fetch if possible; otherwise prefetch projects in the slash handler only (Silo listed projects then opened modal — keep that but do not add extra Plane round-trips after `trigger_id` is stale).

## Issue linkback card

- Title: `IDENTIFIER-seq name` as Plane URL.
- Lines: Project, State, Priority (if not none), Assignee(s), Target date.
- Divider + created/updated context.
- Actions: state change, priority, assign to me, create comment, overflow (weblink; watch in W7.4).
- Thread sync / unsync when applicable (W4).

Unfurl variant: same card, `isUnfurled=true` (no quote prefix).

## Other entity unfurls (W3.1)

Project, cycle, module, page: name, key fields, open in Plane. No mutation actions in MVP except issue cards.

## Comment modal

Plain text comment → Plane `comment_html`. Mentions: best-effort Slack user map.

## `/plane manage` (W6)

List channel subscriptions: pause, disconnect, add. Not JQL filters (W7.1).
