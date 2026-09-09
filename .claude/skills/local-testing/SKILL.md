---
name: local-testing
description: Stands up the hybrid local Plane stack on production volume backups, then smokes and QA-tests the current branch against real Code Orange data. Use when the user asks for local testing, prod-data local, restore backups locally, standup a local environment with real data, or run the local-testing skill.
user_invocable: true
---

# Local Testing (prod backups)

Restore the latest official Plane volume snapshot into `docker-compose-local.yml`, run the current branch via `pnpm dev`, then QA against real workspaces. Do not commit, push, or open PRs. Do not deploy.

Constants, pitfalls, and the QA matrix: [reference.md](reference.md). Fetch/restore: [scripts/fetch-backup.sh](scripts/fetch-backup.sh) and [scripts/restore-hybrid-volumes.sh](scripts/restore-hybrid-volumes.sh).

Never use [`deployments/cli/community/restore.sh`](../../../deployments/cli/community/restore.sh) — it writes `plane-app_*` volumes, not hybrid `plane_*` volumes.

```
Task Progress:
- [ ] 1. Fetch latest backup (agent-owned)
- [ ] 2. Align POSTGRES_* / AWS_* (keep localhost URLs)
- [ ] 3. Restore pgdata + uploads into hybrid volumes
- [ ] 4. Boot stack + pnpm dev
- [ ] 5. Smoke (hard stop on failure)
- [ ] 6. Feature QA scoped to the current diff
- [ ] 7. Isolated unit gates (never the restored DB)
- [ ] 8. Report
```

## Safety

- Full prod DB (emails, hashes, issue content). Keep dumps outside the repo (`~/Downloads/plane-backups/`). Do not commit tarballs or `.env` overrides.
- Do not print `HostingDetails` or `plane.env` secrets.
- Do not copy prod `WEB_URL`, `SITE_ADDRESS`, OAuth, or SMTP into local env.
- Do not register a new god-mode admin — the instance already exists.
- Snapshot existing `plane_pgdata` / `plane_uploads` before overwrite (`restore-hybrid-volumes.sh` does this as `*_devbak`).
- Leave the stack running unless the user asks to tear down.

## 1. Fetch backup

Agent downloads. Do not ask the user to pull Drive files.

Prefer the VPS source of truth (same files uploaded to Drive). Dated Drive children are often not publicly listable.

```bash
bash .claude/skills/local-testing/scripts/fetch-backup.sh
# optional stamp: bash .../fetch-backup.sh 20260909-0315
```

Expect `~/Downloads/plane-backups/<stamp>/{pgdata,uploads}.tar.gz`. Skip Redis/RabbitMQ archives even if present.

Drive fallback (only if VPS fetch fails): parent folder in [reference.md](reference.md). `gdown --folder` on a dated child is usually empty without a logged-in Google session — do not block the standup on Drive.

## 2. Align env

Copy **only** these keys from VPS `/opt/plane-selfhost/plane-app/plane.env` into **both** repo-root `.env` and `apps/api/.env`:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`

```bash
ssh -o BatchMode=yes plane-vps \
  'sudo grep -E "^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_S3_BUCKET_NAME)=" /opt/plane-selfhost/plane-app/plane.env'
```

Keep hybrid locals:

- `POSTGRES_HOST=plane-db`
- `AWS_S3_ENDPOINT_URL=http://localhost:9000` in `apps/api/.env`
- `USE_MINIO=0` in `apps/api/.env`
- `CORS_ALLOWED_ORIGINS` / `APP_BASE_URL=http://localhost:3000` / `ADMIN_BASE_URL=http://localhost:3001`

Restored `PGDATA` ignores compose `POSTGRES_PASSWORD` at init — API auth fails if `.env` still has the default `plane` password.

## 3. Restore volumes

```bash
bash .claude/skills/local-testing/scripts/restore-hybrid-volumes.sh \
  "$HOME/Downloads/plane-backups/<stamp>"
```

Restores **only** `pgdata` and `uploads`. Recreates empty Redis/RabbitMQ volumes. Hybrid stack must be down (script stops it).

## 4. Boot

```bash
docker compose -f docker-compose-local.yml up -d --build
# migrator: "No migrations to apply" is OK (model-only diffs)
pnpm dev
```

URLs: web `http://localhost:3000`, admin `http://localhost:3001/god-mode/`, API `http://localhost:8000`, MinIO `http://localhost:9000` / console `:9090`.

Sign in with a **prod** email/password from `HostingDetails`. Always use `localhost`, never `127.0.0.1` — the latter posts to the API and fails CSRF.

## 5. Smoke (must pass)

- [ ] `GET http://localhost:8000/api/instances/` → 200
- [ ] Login at `http://localhost:3000` → workspace **code-orange**
- [ ] Largest real project board (usually OFF26) — `/issues` redirects to `/issues/list`
- [ ] One issue with attachments; description/file loads from local MinIO (not 403)
- [ ] One existing saved project view
- [ ] Sidebar project link changes the URL without a full app reload

Hard stop if API cannot auth or boards are empty of known prod projects.

## 6. Feature QA

Scope to the current diff (uncommitted + branch). Exercise **real** projects, not `create_dummy_data`. Default surfaces and known pitfalls: [reference.md](reference.md).

If you create a probe work item, name it `LOCAL QA probe <stamp>` and mention it in the report so it can be deleted.

## 7. Isolated unit gates

Pytest uses [`docker-compose-test.yml`](../../../docker-compose-test.yml) (tmpfs). **Never** point it at restored `plane_pgdata`.

```bash
# API — path-scope to the change
docker compose -f docker-compose-test.yml run --rm api-tests \
  pytest plane/tests/unit/<path_or_file>.py -q

# Frontend / packages
pnpm turbo run check:types --filter=web
```

## 8. Report

Concise: backup stamp + source (VPS vs Drive), volumes restored, smoke result, QA findings, unit-gate counts, leftover probe issues. Remind: use `localhost:3000`.

## Teardown (only if asked)

```bash
docker compose -f docker-compose-local.yml down
docker volume rm plane_pgdata plane_uploads   # confirm names first
# revert POSTGRES_* / AWS_* in both .env files to local defaults
```

Keep `~/Downloads/plane-backups/<stamp>/` for re-restore. Previous local data (if snapshotted) is on `plane_pgdata_devbak` / `plane_uploads_devbak`.
