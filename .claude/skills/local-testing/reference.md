# Local Testing — Reference

## Constants

| Key            | Value                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Prod URL       | `https://plane.teamcodeorange.com`                                                                                              |
| SSH alias      | `plane-vps`                                                                                                                     |
| VPS backup dir | `/opt/plane-selfhost/plane-app/backup/<YYYYMMDD-HHMM>/`                                                                         |
| VPS env        | `/opt/plane-selfhost/plane-app/plane.env`                                                                                       |
| Drive parent   | [Plane Backups](https://drive.google.com/drive/folders/1GDJIqpmTV9uttR-3kSNL4k6HYLKfL8Tu) (`1GDJIqpmTV9uttR-3kSNL4k6HYLKfL8Tu`) |
| Local dest     | `~/Downloads/plane-backups/<stamp>/`                                                                                            |
| Hybrid compose | `docker-compose-local.yml` (project name `plane`)                                                                               |
| Hybrid volumes | `plane_pgdata`, `plane_uploads`, `plane_redisdata`, `plane_rabbitmq_data`                                                       |
| Workspace      | `code-orange`                                                                                                                   |
| Login notes    | gitignored `HostingDetails` (do not echo)                                                                                       |

Official backup files: `pgdata.tar.gz`, `uploads.tar.gz`, `redisdata.tar.gz`, `rabbitmq_data.tar.gz`. Local restore uses the first two only.

Postgres in all compose files is `15.7-alpine` — physical `PGDATA` snapshots are compatible. Official backups are `docker cp` of a **running** Postgres; startup may replay WAL. Crash-loop → try the previous stamp.

## Why not official restore.sh

[`deployments/cli/community/restore.sh`](../../../deployments/cli/community/restore.sh) looks for `plane-app_{pgdata,uploads,...}`. Hybrid compose creates `plane_pgdata` / `plane_uploads`. Use `scripts/restore-hybrid-volumes.sh`.

## Env mapping

| Key                            | Root `.env`                                 | `apps/api/.env`                     |
| ------------------------------ | ------------------------------------------- | ----------------------------------- |
| `POSTGRES_*` / `AWS_*` secrets | from VPS                                    | from VPS                            |
| `POSTGRES_HOST`                | unused by API                               | `plane-db`                          |
| `AWS_S3_ENDPOINT_URL`          | `http://plane-minio:9000` (MinIO container) | `http://localhost:9000`             |
| `USE_MINIO`                    | `1` (root default; leave)                   | `0`                                 |
| `WEB_URL` / app base URLs      | do not copy from prod                       | localhost ports from `.env.example` |

## Known projects (as of 20260909 snapshot)

| Identifier                                    | Name                  | Typical use                |
| --------------------------------------------- | --------------------- | -------------------------- |
| OFF26                                         | Offseason Projects 26 | Largest board (~30 issues) |
| PROGOFF26                                     | Software OFF 26       | Software work              |
| MANUOFF26                                     | Manufacturing OFF 26  | Attachments / intake       |
| CODEO                                         | Code Orange Intro     | Cycles + modules           |
| DSNOFF26 / BUSOFF26 / OFFTRAIN26 / OUTREACH26 | other OFF26           | sidebar nav                |

Saved views seen: `Offseason Projects Kanban` (OFF26), `Project Urgent Tasks` (CODEO).

## CSRF / URLs

- Open **`http://localhost:3000`**, not `http://127.0.0.1:3000`.
- Sign-in posts to `http://localhost:8000/auth/sign-in/`. A `127.0.0.1` origin fails CSRF.
- New uploads: `http://localhost:9000/uploads/...`.
- Inline description HTML may still point at `https://plane.teamcodeorange.com/uploads/...` (hits prod). Attachments via API-generated URLs should use local MinIO.

## Feature QA (default matrix)

Scope to the current diff. Skip surfaces the diff does not touch.

### Boards / layouts

Routes: `/:ws/projects/:projectId/issues/{list,board,calendar,table,timeline}`.

- `/issues` redirects to the stored layout slug
- Layout switch keeps cached panes; filter changes must refresh
- `group_by` / `sub_group_by` refetch; layout-only switch does not wipe the store
- Kanban: clearing `group_by` clears `sub_group_by`; default `group_by` is `state`
- Cycle/module boards use stored `displayFilters.layout` (no layout sub-routes)

### Create / edit

- Project modal: title + assignees/labels/cycle/modules — board row counts look right
- Cycle board create with a **different** cycle in the modal lands in the chosen cycle
- Required custom properties fail closed
- Peek + issue-detail property edits
- Completed cycles: no add/drag (`issue-layout-policy.ts`)

### Views / filters

- Existing prod views (legacy `filters` and `rich_filters`)
- Save + reopen matches the filter bar
- `updated_at` views may differ from prod (bugfix: used to filter `created_at`)
- Sub-issue / epic toggles on a project that has them

### Intake / drafts / archive

- Intake submit + list
- Drafts publish (especially with description assets)
- Archive list still loads (API unified; UI may still be the old list)

### Cross-surface

- Workspace views (`/:ws/workspace-views`, `/all-issues`)
- Rapid nav project → cycle → module → view
- Compare 2–3 counts (board vs saved view) with identical filters

## Isolated tests vs restored DB

| Stack      | Compose                    | Data                         |
| ---------- | -------------------------- | ---------------------------- |
| Hybrid app | `docker-compose-local.yml` | Restored prod volumes        |
| Pytest     | `docker-compose-test.yml`  | Ephemeral tmpfs — never prod |

Do not run `api-tests` against `plane-db`.

## Drive download notes

1. Parent embedded view lists dated **folders** (`20260908-1329`, `20260909-0315`, …).
2. Child folder HTML is a login wall; unauthenticated `gdown.download_folder` completes with **zero files**.
3. Chrome cookie export + `gdown` still listed empty in practice.
4. Use VPS `sudo tar -C .../backup -cf - <stamp>` (these snapshots are ~30MB compressed; OpenSSH ERANGE is a large-image problem, not this).
