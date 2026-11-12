# Deployment

`npm run build` writes a static site to `out/`. Any static host works. Nothing
runs on a server.

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
