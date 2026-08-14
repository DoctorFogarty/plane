# W5 — Personal DMs

Read first: [../CONTEXT.md](../CONTEXT.md)

## Depends on

D1 and W1.3; should follow W0.2 event catalog.

## Parallel with

Waves 2–4 after D1.

## Goal

Add Slack as a delivery channel on UserNotificationPreference; hook notifications(); DM email-class events (assigned, mention, comment, state/completed); default on after personal connect.

## In scope

- Users without Slack link unchanged.
- Actor does not DM themselves.
- Tests assert gating booleans.
- If prefs surface in web: Plane notification settings copy “Slack DMs” / “Email”.
- Deploy.

## Out of scope

Essentials vs All filters (W7.6 related / W7). Channel subscriptions (W6).

## Read / touch

`apps/api/plane/db/models/notification.py`; `apps/api/plane/bgtasks/notification_task.py`; event-catalog.md.

## Skills

validate-and-deploy-vps; vercel-react-best-practices if web prefs.

## Done when

Users without Slack link unchanged; actor does not DM themselves; tests assert gating booleans; VPS deploy.

## Prompt

Add Slack DM delivery to notifications() using existing preference booleans plus a slack channel flag. Do not implement channel project subscriptions. Validate and deploy.

## Handoff (fill when complete)

- Files changed:
- APIs added:
- Tests:
- Deployed? (URL / smoke):
- Risks for the next agent:
