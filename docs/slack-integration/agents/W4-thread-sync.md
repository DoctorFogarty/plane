# W4 — Live thread sync

Read first: [../CONTEXT.md](../CONTEXT.md)

## Depends on

W3.1 and W2.1 (enable-on-create).

## Parallel with

None required. W5 may run in parallel after D1.

## Goal

SlackThreadLink; enable on create / link existing / unsync; Slack thread replies → IssueComment with external_source/external_id; Plane comments → Slack thread; skip bot loops.

## In scope

- Dedupe on external_id / Slack ts.
- Unsync stops both directions.
- Tests for both hops.
- Deploy.

## Out of scope

Backfill of prior replies (W7.5).

## Read / touch

W1.2 SlackThreadLink; IssueComment.external_source/external_id; message events; comment webhooks/activity.

## Skills

validate-and-deploy-vps.

## Done when

Duplicate Slack ts does not double-post; unsync stops both directions; tests for both hops; VPS deploy.

## Prompt

Implement live Slack↔Plane thread comment sync with external_id dedupe. No historical backfill. Validate and deploy.

## Handoff (fill when complete)

- Files changed:
- APIs added:
- Tests:
- Deployed? (URL / smoke):
- Risks for the next agent:
