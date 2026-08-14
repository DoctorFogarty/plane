# D-MVP — Validate and deploy (MVP gate)

Read first: [../CONTEXT.md](../CONTEXT.md)

## Depends on

W6.

## Parallel with

None.

## Goal

Full MVP image set on the VPS; smoke Plane + Slack ingress; confirm /plane, unfurl, DMs, and a test channel subscription against live Slack.

## In scope

- Follow validate-and-deploy-vps for all Wave 1–6 API+web images.
- Smoke HTTPS.
- Do not start Wave 7 until this gate is accepted.

## Out of scope

Wave 7 features. Commit/push.

## Read / touch

`.claude/skills/validate-and-deploy-vps/SKILL.md`.

## Skills

validate-and-deploy-vps.

## Done when

Smoke 200s; Slack MVP paths reachable; handoff confirms MVP gate.

## Prompt

Follow validate-and-deploy-vps for all Wave 1–6 API+web images. Smoke HTTPS. Do not commit or push.

## Handoff (fill when complete)

- Files changed:
- APIs added:
- Tests:
- Deployed? (URL / smoke):
- Risks for the next agent:
