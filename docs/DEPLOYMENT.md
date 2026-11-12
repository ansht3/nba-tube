# Deployment

`npm run build` writes a static site to `out/`. Any static host works. Nothing
runs on a server.

## Vercel (recommended)

`vercel.json` makes every Vercel build sync the catalog from the official
channels first, then build the static site. If the sync fails, the build falls
back to the committed seed instead of failing.

1. Import the repository in the Vercel dashboard, or run `npx vercel` and then
   `npx vercel --prod` from the project folder.
2. Optional: add `YOUTUBE_API_KEY` under Project Settings > Environment
   Variables for durations and deeper history. It is used only during the
   build and never reaches the browser.
3. Pushes to `main` deploy to production. Pushes to other branches get preview
   URLs.

The catalog only refreshes when Vercel builds. To refresh on a schedule,
create a Deploy Hook (Project Settings > Git > Deploy Hooks) and call it from
any scheduler, for example a GitHub Actions cron job that runs
`curl -X POST "$VERCEL_DEPLOY_HOOK"`.

Cost: the Hobby plan is free for personal, non-commercial projects. A
commercial site needs the Pro plan.

## GitHub Pages (included workflow)

`.github/workflows/deploy.yml` syncs the catalog, builds with the right base
path and publishes to Pages: on every push to `main`, every three hours, and on
demand. It is off until you turn it on:

1. Repository Settings > Pages > Source: **GitHub Actions**.
2. Settings > Secrets and variables > Actions > Variables: add `PAGES_ENABLED` = `true`.
3. Optional: add the secret `YOUTUBE_API_KEY` for the full catalog.
4. Run the workflow from the Actions tab, or push to `main`.

The site will be public even if the repository is private.

## Other hosts

Run `npm run sync && npm run build` on a schedule and upload `out/`. For a
sub-path, set `NEXT_PUBLIC_BASE_PATH` (for example `/nba-tube`) at build time.

## What costs money

Nothing by default: GitHub Pages, Actions minutes on a public repo and the
YouTube Data API within its free quota. A private repository uses Actions
minutes from your plan's allowance (about 2 to 3 minutes per run).
