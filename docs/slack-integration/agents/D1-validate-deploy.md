# D1 — Validate and deploy (first live Slack endpoint)

Read first: [../CONTEXT.md](../CONTEXT.md)

## Depends on

W1.6.

## Parallel with

None.

## Goal

Ship Wave 1 to https://plane.teamcodeorange.com so Slack Request URL and OAuth redirects work.

## In scope

- Scoped pytest for new Slack modules; check:types --filter=web.
- Build backend + frontend :local.
- deploy-local-images.sh.
- Smoke /, /god-mode/, /api/instances/, unsigned Slack ingress 401.

## Out of scope

Configuring Slack app credentials in chat. Commit/push.

## Read / touch

`.claude/skills/validate-and-deploy-vps/SKILL.md` and reference.md.

## Skills

validate-and-deploy-vps.

## Done when

Smoke 200s; Slack url_verification can succeed against the VPS; handoff lists live Request URL and OAuth redirect.

## Prompt

Follow .claude/skills/validate-and-deploy-vps. Validate Wave 1 API+web changes, build linux/amd64 images, deploy to plane-vps, smoke HTTPS. Do not commit or push.

## Handoff (fill when complete)

- Files changed:
- APIs added:
- Tests:
- Deployed? (URL / smoke):
- Risks for the next agent:
