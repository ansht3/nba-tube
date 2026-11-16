# Database

The shared catalog lives in Postgres (Neon). The site and the ingestion Worker
reach it through the small `Db` interface in `src/db/db.ts`, so one set of SQL
runs on Neon in production and on PGlite (real Postgres in WebAssembly) in tests.

## Schema (`src/db/migrations.ts`)
| Table | Purpose |
|---|---|
| `videos` | One row per YouTube id. `data` holds the full validated record; `published_at`, `content_type`, `section`, `team_ids`, `channel_id` are columns beside it so lists can be filtered and ordered by index. |
| `channels` | Channel id, title, publisher type. |
| `catalog_versions` | One row per published catalog: an increasing `version`, `mode`, `video_count`, `newest_published_at`, and the ingestion run that made it. Clients compare this number. |
| `ingestion_runs` | One row per ingestion run: owner, timing, status and counts (discovered, accepted, rejected, updated, failed). |
| `source_checkpoints` | Per channel: last attempt, last success, newest video seen, consecutive failures, last error. |

IDs and ordering use `COLLATE "C"` (byte order), so "newest first, ties by id" is
the same in SQL as in `compareVideos` and cursors stay stable.
Indexes: `(published_at DESC, youtube_id)`, the same with `content_type`,
`section` and `channel_id` in front, and a GIN index on `team_ids`.

## Behaviour that matters
- **Idempotent.** `publishVideos` upserts by YouTube id. Replaying the same
  videos writes nothing and keeps the current version.
- **Atomic.** The rows and the new catalog version are written in one
  transaction. A failure leaves neither.
- **Validated.** Every record is parsed with the catalog schema before any SQL
  runs; one invalid record rejects the whole call.
- **Never deletes because of an outage.** The only deletion is `pruneExpired`,
  which looks at dates only: videos older than 45 days, and YouTube Data API
  metadata not refreshed within 30 days (YouTube's storage rule). It publishes a
  version when it removes anything.
- **Migrations are idempotent** and run under an advisory lock, so two processes
  migrating at once take turns.

## Set it up (manual, once)
1. Create a Neon project and copy its connection string.
2. Put it in a local `.env` as `DATABASE_URL=...` (git-ignored).
3. `npm run db:migrate` creates the tables.
4. `npm run db:import -- --from https://nba-tube.vercel.app/catalog.json` loads
   the live catalog. It only inserts and updates, so it is safe to repeat.
5. Later phases add `DATABASE_URL` to Vercel and the Worker (docs/MIGRATION.md).

## What is verified
The SQL, migrations, idempotency, atomic publication (including rollback) and
retention are tested against real Postgres through PGlite (`npm test`).

## What is not
`src/db/neon.ts` (the production adapter) type-checks but has **not been run
against a real Neon database**: there are no credentials in the development
environment. Its transaction call is the documented non-interactive form. The
first `npm run db:migrate` against Neon is the real test; if it fails, the error
is printed without the connection string.
