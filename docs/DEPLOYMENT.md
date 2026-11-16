# Deployment

The site is a static export hosted on Vercel. Nothing runs on a server.

## How it works

- **Every Vercel build syncs first.** `vercel.json` runs `npm run sync` and
  then `npm run build`. If the sync fails, the build falls back to the
  committed seed instead of failing.
- **Builds carry the catalog forward without commits.** A build server has no
  `data/catalog.json`, so the sync downloads the live site's `/catalog.json`
  (from `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets) and continues from
  it. Videos are kept for 45 days even after they scroll out of a channel's feed.
- **A scheduled check triggers rebuilds.** `.github/workflows/refresh.yml` runs
  every 10 minutes. `npm run check-updates` reads the 31 channel feeds (no API
  key, no quota) and compares them with the live catalog. Only when an official
  channel has posted a video the site would publish does it call the Vercel
  Deploy Hook. New videos appear about 10 to 15 minutes after upload, and Vercel
  only builds when something changed.
- **Security headers** (Content-Security-Policy, no framing, nosniff) are set in
  `vercel.json`. `npm run preview` applies the same headers locally.

## One-time setup

1. Import `ansht3/nba-tube` in Vercel and deploy with the default settings.
2. In Vercel: Project > Settings > Git > **Deploy Hooks**. Create one named
   `refresh` for branch `main`. Copy its URL.
3. In GitHub: Settings > Secrets and variables > Actions:
   - **Secret** `VERCEL_DEPLOY_HOOK` = the hook URL. Treat it like a password:
     anyone with it can start builds.
   - **Variable** `SITE_URL` = the production URL, for example
     `https://nba-tube.vercel.app`.
4. Optional: in Vercel, add the environment variable `YOUTUBE_API_KEY` for
   durations and deeper history. It is only read during the build.

GitHub Actions must be able to run on the account. If a job says "account is
locked due to a billing issue", fix that under GitHub Settings > Billing first.

## Checking that refreshing works

A green workflow used to mean nothing: without the deploy hook the job printed a
notice and succeeded. Now:

- **The `Refresh videos` job is red** when `VERCEL_DEPLOY_HOOK` or `SITE_URL` is
  missing, when the hook request fails, or when any video has been missing from
  the site for more than an hour (`status=stuck`). Its run summary lists the
  refresh status, how many videos are waiting, the oldest wait, the live
  catalog's age and what the last build's sync reported.
- **`/status.json` on the live site** says what the current build is made of:
  `generatedAt`, `mode`, `videoCount`, `newestPublishedAt`, and `sync`
  (`ok`, `usedFallback`, `error`). `usedFallback` is `previous-catalog` when the
  build's sync failed and the last published catalog was kept instead of the
  committed seed.
- **Locally:** `SITE_URL=https://nba-tube.vercel.app npm run check-updates`
  prints `status` as `current`, `pending` (waiting less than an hour), `stuck`
  or `unreachable`.

GitHub runs scheduled workflows on a best-effort basis. On a quiet repository
they can run hours apart instead of every 10 minutes (the runs of this repo were
4 to 6 hours apart). If freshness within minutes matters, do not rely on the
schedule.

### Production state when this was written (2026-11-16)
- The live catalog had been generated on 2026-11-12 21:33 UTC, 82 hours earlier.
- `npm run check-updates` against it reported 168 videos waiting, the oldest for
  78 hours (`status=stuck`).
- The repository had no `VERCEL_DEPLOY_HOOK` secret and no `SITE_URL` variable,
  so every scheduled run succeeded without doing anything.

## Without GitHub Actions

Any scheduler that can send an HTTP POST can trigger the hook, for example a
free cron service. It cannot tell whether anything changed, so keep it to every
30 or 60 minutes: each call is a full build (about 1 to 2 minutes).

## Limits and cost

- Vercel Hobby is free for personal, non-commercial projects and allows a limited
  number of deployments per day. With change detection, rebuilds happen only
  when a team posts, typically a few dozen times a day in season.
- GitHub Actions is free for public repositories.
- The YouTube Data API is free within the 10,000 unit daily quota. A sync uses
  under 100 units.
