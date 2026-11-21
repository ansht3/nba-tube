# Operations

How the pieces run, what they cost, how to tell what is wrong, and how to
recover. Measured numbers are marked with the date and what they ran on.

## The pieces
| Piece | Does | Where it runs |
|---|---|---|
| Next.js app | pages, `/api/*`, security headers | Vercel |
| Neon Postgres | the catalog: videos, channels, versions, runs, checkpoints, lease | Neon |
| Ingestion worker | polls the 31 channels every 5 minutes, writes to Postgres | Cloudflare Workers (cron) |
| (Old) deploy-hook refresh | rebuilds the site from feeds | GitHub Actions; keep until the worker has run cleanly for a week |

The app picks its catalog source by one variable. **`DATABASE_URL` set: Postgres. Unset: the JSON file built at deploy time.** Unsetting it is the rollback.

## Switch-over, step by step (all manual, none done yet)
1. Neon: create a project, copy the connection string. `.env`: `DATABASE_URL=...`.
2. `npm run db:migrate`, then `npm run db:import -- --from https://nba-tube.vercel.app/catalog.json`. Safe to repeat; it only inserts and updates.
3. Cloudflare: from `worker/`, `npx wrangler login`, `npx wrangler secret put DATABASE_URL` (and optionally `YOUTUBE_API_KEY`), then `npx wrangler deploy`. On Workers Free set `MAX_CHANNELS_PER_RUN = "12"` in `worker/wrangler.toml` (50 subrequests per run).
4. Watch it: `npx wrangler tail` for the JSON line each run logs, and open `/api/health` on a deployment that has `DATABASE_URL` (see below).
5. Vercel: add `DATABASE_URL` to the project's environment and redeploy. Check `/api/version` changes after a new upload and the home page shows it within a minute (pages revalidate every 60 s).
6. After a week of clean runs: remove the deploy hook workflow (`.github/workflows/refresh.yml`) and the sync step in `vercel.json`.

Order matters: deploy the app first **without** `DATABASE_URL` (nothing changes for viewers), prove the worker is writing, then add the variable.

## Monitoring: three different questions
`GET /api/health` (never cached, no secrets) answers them separately:
- **Is the worker running?** `worker.state`: `ok` (success within 15 minutes), `late` (15 to 60), `down` (older, or it never succeeded). `down` returns HTTP 503, so any uptime monitor can alert on it.
- **Are the sources being read?** `sources.state`: `stale` when three or more channels have failed several runs in a row, or one channel has not been read for an hour. The worker can be fine while a channel's feed is broken.
- **What do viewers see?** `catalog.publishedAgeMinutes` and `newestVideoAgeMinutes`. These only inform: an old newest video on a quiet night is not an outage.

Without `DATABASE_URL` it reports the file catalog and says there is no worker to check. The existing `/status.json` and the `Refresh videos` workflow summary (docs/DEPLOYMENT.md) cover the old path. Cloudflare's dashboard shows a run as failed when the worker throws, which it does for a `failed` run.

Suggested alerts: `/api/health` returns 503; or `status` is `degraded` for more than 30 minutes.

## Failure recovery
| Symptom | Likely cause | What to do |
|---|---|---|
| Health: worker `down` | Worker not deployed, cron disabled, bad `DATABASE_URL`, Neon paused | `npx wrangler tail`; fix; the next run resumes (lease expires on its own after 240 s) |
| Worker runs but `sources: stale` | A channel feed changed or YouTube is blocking | The failing channels are in the run's log line (`failedChannels`); other channels keep working; check one feed by hand |
| Site shows no new videos, health ok | Page cached (60 s) or CDN (30 s) | Wait a minute; `/api/version` is the truth |
| `/api/*` returns 503 | Database unreachable | Viewers keep the last cached pages (ISR keeps the last good page on a failed refresh). Unset `DATABASE_URL` to serve the file catalog while fixing it |
| A bad deploy | Anything | Redeploy the previous build; the database is independent of deploys |
| Catalog looks wrong after a classifier change | Rules apply to new videos only | Re-run `npm run sync`, then `npm run db:import` |

Nothing the worker does can shrink the catalog because a request failed: it only inserts and updates, and removes a video only when YouTube confirms it is gone, or by the age rules (45 days; Data API metadata 30 days).

## Cost (check current plan limits before relying on these)
- **Vercel Hobby:** free for a personal project. API reads are cached at the CDN for 30 s (lists) and 15 s (version); a 304 costs one tiny database query.
- **Neon:** the catalog is about 3,000 videos, a few megabytes. At one version lookup per client poll and one list query per uncached page, reads are small. A free plan should be enough; check its storage and compute limits.
- **Cloudflare Workers:** 288 runs a day. Free allows 50 subrequests per run, which is why `MAX_CHANNELS_PER_RUN` exists; Paid ($5/month at time of writing) allows 1,000 and needs no limit.
- **YouTube Data API:** optional. Keyless feeds cost no quota. With a key, enrichment is capped at 200 units per run of a 10,000 daily quota.

## Measured results
Run `npm run load-test` (in-process, Postgres via PGlite) and `npm run load-test -- --url <base>` (HTTP). Both are reproducible; the synthetic catalog is deterministic.

**Machine:** Apple M3 Pro laptop, Node 22, 2026-11-16. PGlite is single-threaded Postgres in WebAssembly, so it shows our code and SQL cost, not Neon's network latency or scale. Real Neon numbers are **not measured**.

In-process, 3,000 videos, 50 concurrent clients, 4,000 requests (40% first page, 20% deep pages, 20% team filter, 10% search, 10% best-first postgame):

| | req/s | p50 | p95 | p99 | errors | queries/request |
|---|---|---|---|---|---|---|
| Uncached | 1,053 | 45 ms | 59 ms | 84 ms | 0% | 3.00 |
| Repeat with `If-None-Match` | 9,439 | 5.1 ms | 6.1 ms | 9.8 ms | 0% | 1.00 (all 304) |

Over HTTP against `npm run start` (file catalog of 553 videos), 50 clients, 3,000 requests each:

| | req/s | p50 | p95 | p99 | errors |
|---|---|---|---|---|---|
| `GET /api/videos` | 1,668 | 27 ms | 39 ms | 104 ms | 0% |
| same with `If-None-Match` (all 304) | 3,465 | 13 ms | 22 ms | 29 ms | 0% |
| `GET /api/version` | 2,607 | 18 ms | 25 ms | 31 ms | 0% |

**Compared with the original implementation** (same 553-video catalog):
- Opening Browse downloaded the whole catalog: **332 KB**, growing with the catalog (about 2.4 MB at the 3,000-video cap). It now fetches one page: **14.4 KB** (24 videos), about 23 times less, and constant as the catalog grows.
- Checking for new videos downloaded or revalidated that whole file every 5 minutes; a change meant 332 KB again. It now asks a **122-byte** version endpoint and only fetches the few new videos when the version changed.
- New videos reached the site only after a rebuild triggered by a workflow that had silently stopped (the live catalog was 82 hours stale). They now reach it within about the worker interval plus the cache windows, without a deploy.
- Cache hit rate: not measurable here (there is no CDN in front of the test). The 304 path is measured above; the CDN's actual hit rate has to be read from Vercel's analytics after deploy.

## What has not been verified
- Neon (the production adapter) and Cloudflare Workers (the runtime and its real subrequest accounting) have never been run: there were no accounts. Both were exercised through equivalents (PGlite, a non-Node bundle).
- A real Vercel deployment, and the Vercel CDN's caching of these headers.
- The YouTube Data API paths against the live API (no key).
- GitHub Actions: the refresh workflow's new failure behaviour is tested only as shell logic, not run by GitHub.
