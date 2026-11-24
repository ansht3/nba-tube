# Ingestion

A scheduled job discovers new official uploads and writes them to the database,
so new videos reach the site without a frontend deploy. The logic is
`runIngestion` in `src/ingest/run.ts`; the Cloudflare Worker in `worker/` only
wires secrets, the channel allowlist and the clock to it.

## What one run does
1. **Lease.** Claims a database lease (`leases` table, 240 s, database clock).
   If another run holds it, this run exits as `skipped` without touching anything.
   A crashed run loses its lease when it expires.
2. **Discover.** Polls each approved channel's feed (the same discovery as the
   sync), up to `maxChannelsPerRun`, least recently attempted first, four at a
   time. Requests have timeouts and exponential backoff with jitter. A channel
   that fails is recorded and skipped; the others carry on.
3. **Missed uploads (optional).** With `YOUTUBE_API_KEY`, if every feed entry
   is newer than the channel's checkpoint (so uploads may have fallen off the
   15-entry feed), the uploads playlist is read through the Data API (about 3
   quota units, capped at 200 per run).
4. **Classify.** The same deterministic rules and overrides as the sync. Videos
   older than the retention window (45 days) are ignored, not stored.
5. **Verify.** A new video is embed-checked before it is stored. `unavailable`
   rejects it; an inconclusive check stores nothing and the feed offers it again
   next run.
6. **Re-check.** The 10 stored videos checked longest ago are re-verified.
   Only a confirmed "gone" removes one; an inconclusive check changes nothing.
   A passing check records `provenance.embedCheckedAt` and leaves
   `metadataCheckedAt` alone: oEmbed refreshes no API data, so it must not extend
   the 30-day limit on it. "Checked longest ago" means the later of the two.
7. **Write.** Checks the lease is still held, then writes changed videos,
   confirmed removals and the new catalog version in **one transaction**. Rediscovered
   videos keep what a feed cannot know (duration, embedding, provenance), so an
   unchanged video writes nothing.
8. **Checkpoints.** Per-channel last attempt, last success, newest video seen and
   failure count are updated only after the write succeeded.
9. **Retention.** Videos past 45 days, and API metadata older than 30 days, are
   removed (the only deletion that is not a confirmed "gone").
10. **Record.** One `ingestion_runs` row with discovered, accepted, rejected,
    updated and failed counts, then the lease is released.

A run that changes nothing does not create a catalog version.

**Time budget.** A run that outlives its 240-second lease loses it and writes
nothing, and the next run would repeat the same slow work. So no new channel read,
embed check or recheck is started once 210 seconds have passed (the lease minus a
30-second margin for requests already in flight), and what finished is published.
Channels not read count as failed for that run, so their checkpoints stay put and
they go first next time; new videos not yet verified are neither stored nor
rejected, and the feed offers them again. The run is "partial" and says why.

**Withdrawal.** A stored video is removed when it is rediscovered and rejected for
a policy reason (manual exclusion, unverified publisher), and stored videos of
channels no longer in the approved list are removed. Nothing is removed when the
approved list is empty, or when it would remove most of the catalog. Title-rule
and duration rejections never delete. Runs and versions older than 30 days are
trimmed, always keeping the newest version, the latest run and the latest success.

## Run it locally (real feeds, no database account needed)
```
npm run ingest -- --local --twice
```
Uses an in-memory Postgres (PGlite) and the live YouTube feeds, and runs twice to
show the second pass changes nothing. Measured on 2026-11-16: pass 1 stored 340
videos in 4.5 s as version 1; pass 2 changed nothing in 1.0 s and kept version 1.

## Deploy the Worker (manual, once)
1. Set up the database first (docs/DATABASE.md): create the Neon project, run
   `npm run db:migrate`, then `npm run db:import -- --from https://nba-tube.vercel.app/catalog.json`
   so existing videos are in before the Worker starts.
2. `npx wrangler login`, then from `worker/`:
   `npx wrangler secret put DATABASE_URL` (and optionally `YOUTUBE_API_KEY`).
3. `npx wrangler deploy` (cron `*/5 * * * *`, from `worker/wrangler.toml`).
4. Watch the first runs: `npx wrangler tail`. Each run logs one JSON line with
   its counts. A failed run throws, so it shows as an error in Cloudflare.

### Plan limits
A full run makes about 31 feed requests, one embed check per new video, 4 per
re-check batch and about 6 database calls. **Workers Free allows 50 subrequests
per invocation**, so on Free set `MAX_CHANNELS_PER_RUN = "12"` in `wrangler.toml`
(each channel is still polled at least every ~15 minutes). Workers Paid allows
1,000 and needs no limit.

## What is verified
- The runner against real Postgres (PGlite) with a fake YouTube: 18 tests cover
  discovery, rejection, idempotency across time, duplicates, a failing channel,
  all channels down (nothing deleted), inconclusive versus confirmed-gone
  checks, retention, rotation, a held lease, two simultaneous runs, an expired
  lease, and losing the lease mid-run (nothing written).
- The same code against the real YouTube feeds with an in-memory database
  (numbers above).
- The Worker entry type-checks and bundles for a non-Node runtime (no Node
  built-ins; about 1 MB).

## What is not
- `src/db/neon.ts` against a real Neon database.
- The Worker running on Cloudflare (no account in this environment), including
  the real subrequest accounting.
- The YouTube Data API paths (enrichment and missed-upload recovery) against the
  live API: there is no key; they follow the existing, unit-tested API client.
