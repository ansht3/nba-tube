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
