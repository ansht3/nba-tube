# Migration: static catalog to a shared database

Status: plan. Each phase is a commit or a manual step, and none of them needs
downtime or deletes data. Update the status lines as phases land.

## Why
Today the catalog is one JSON file generated at build time. New videos need a
Vercel rebuild, the browser downloads the whole file (313 KB for 387 videos,
about 2.4 MB at the 3,000-video cap), and every page, count, search and
"related" list assumes the full catalog is in memory. A scheduled build is also
the only freshness mechanism, and on 2026-11-16 it had silently stopped: the
live catalog was 82 hours old with 168 videos missing (docs/DEPLOYMENT.md).

## Target
- **Neon Postgres** holds videos, channels, ingestion runs, per-channel
  checkpoints, catalog versions and a lease.
- **A scheduled Cloudflare Worker** (every 5 minutes) runs the existing
  feed-based discovery and the existing classifier, and writes to Postgres. It
  never needs a frontend deploy.
- **The Next.js app on Vercel** reads through one `CatalogRepository`
  interface. With `DATABASE_URL` set it reads Postgres; without it, it reads
  the committed/synced JSON exactly as today. Public reads are cached at the CDN.
- The YouTube API key and database URL stay server-side (Worker and Vercel
  environment). Videos stay on YouTube's embedded player.

## Phases
| # | Change | Site behaviour | Rollback |
|---|---|---|---|
| 0 | Refresh failures are visible (done) | none | n/a |
| 1 | `CatalogRepository` interface; the file implementation wraps today's code; pages call it | identical | revert the commit |
| 2 | Postgres schema, migrations, idempotent upserts, transactional versions, import tool | none (database unused) | drop the database |
| 3 | Worker ingests into Postgres on a lease with checkpoints | none (site still static; the old sync keeps running) | disable the cron trigger |
| 4 | App stops being a static export: `/api/videos`, `/api/version`, ISR pages; repository chosen by `DATABASE_URL` | identical while `DATABASE_URL` is unset | redeploy the previous build |
| 5 | Manual: provision Neon, migrate, import the live catalog, deploy the Worker, confirm the version advances, then set `DATABASE_URL` in Vercel | pages and API read the database | unset `DATABASE_URL`: back to JSON in one redeploy |
| 6 | Retire the deploy-hook refresh once the Worker has run cleanly for a week | none | re-enable the workflow |

Phase 4 is the only change to how the site is built and served. It ships first
**without** a database, so production keeps serving today's catalog while the
new code path is proven; `DATABASE_URL` is the only switch.

## No data loss
- Videos are keyed by YouTube ID; every write is an upsert, so replays and
  overlapping runs are harmless.
- The import tool reads the live `/catalog.json` and only inserts or updates.
  Nothing is deleted because a source was unreachable. Removal happens only by
  the retention rules (45 days since publication; API-derived metadata older
  than 30 days, per YouTube's policy), or an explicit manual exclusion.
- A catalog version is published in the same transaction as the writes it
  covers, so readers never see a version whose rows are missing.

## What breaks if the static export goes away (and where it is handled)
| Assumption today | Handled in |
|---|---|
| Pages call `loadCatalog()` at build time and bake counts and related videos | phase 1 (repository) and phase 4 (ISR, per-request queries) |
| `/watch/[id]`, `/teams/[teamId]` use `generateStaticParams` with `dynamicParams=false`, so a new video has no page | phase 4: pages render on demand and are cached |
| The browser fetches all of `/catalog.json` for search, filters, "Show more", saved-list checks | commits 5 to 7: paginated API with server-side filtering |
| `NewVideosNotice` downloads the whole catalog every 5 minutes | commit 6: a tiny version endpoint |
| E2E tests serve `out/` and read `out/catalog.json` | phase 4: tests run against `next start` |
| `CLAUDE.md` and DECISIONS say "static export only" | updated in the phase 4 commit |
| `connect-src 'self'` in the CSP | still correct: the API is same-origin |

## Known costs of the move
- Search, "best first" ranking, counts and "N left" must be computed by the
  database. Search stays substring-based and keeps accent stripping; "best
  first" keeps its published formula.
- `data/sources.json` and `data/overrides.json` are bundled into the Worker at
  deploy time, so changing them needs a Worker redeploy.
- Hobby-tier limits apply (Vercel function and cron limits, Worker subrequests
  per invocation); the Worker processes channels in bounded batches.
