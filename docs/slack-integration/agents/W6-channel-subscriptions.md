# W6 — Channel subscriptions v1

Read first: [../CONTEXT.md](../CONTEXT.md)

## Depends on

W4 and W5.

## Parallel with

None.

## Goal

Project↔channel subscription; events create, state, assignee, comment; pause/disconnect in Plane settings and /plane manage; coalesce to 1 msg/s/channel; private project → public channel default deny unless admin ack.

## In scope

- UI: list of channel maps like GitHub repo mapping. Empty: No channels connected + Add channel.
- Direct imports; SWR for the list.
- Tests for matcher + pause.
- Deploy.

## Out of scope

JQL-like rich-filters and multiple filter-subs (W7.1).

## Read / touch

SlackChannelSubscription model; notifications/activity; settings UI; /plane manage modal.

## Skills

validate-and-deploy-vps; vercel-react-best-practices; frontend-design.

## Done when

Create-only Silo behavior is gone; burst of 20 updates becomes a digest or queued singles under rate limit; tests for matcher + pause; VPS deploy.

## Prompt

Implement Slack channel subscriptions for create/state/assignee/comment with coalescing and /plane manage. Match Plane settings UI. Do not add rich-filters. Validate and deploy.

## Handoff (fill when complete)

- Files changed:
- APIs added:
- Tests:
- Deployed? (URL / smoke):
- Risks for the next agent:
