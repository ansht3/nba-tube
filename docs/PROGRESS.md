# Progress

Durable checkpoint for anyone (or any session) picking this up.

## Status: feature complete, verified locally

Branch `dev` holds all work and is pushed. `main` is fast-forwarded to `dev`
after the full check suite passes.

## Done and verified

| Milestone | How it was verified |
| --- | --- |
| Research and decisions | docs/RESEARCH.md, ARCHITECTURE.md, DECISIONS.md |
| 31 verified source channels | Each resolved to a channel id with evidence; see RESEARCH.md §4 |
| Deterministic classifier | Unit tests from real titles; hand audit of a 465-video live sync |
| Ingestion: Data API and keyless feeds | Unit tests with recorded response shapes; live keyless sync run |
| Committed seed catalog (206 videos) | Built by `npm run seed` from the live feeds |
| Site: home, 4 sections, teams, browse, watch | Playwright on desktop and Pixel 7 |
| Likes, watch later, history, playlists, settings | Playwright, including reloads and corrupted storage |
| Accessibility | axe on 11 pages in both themes; keyboard focus fixes |
| CI | `.github/workflows/ci.yml` (lint, types, unit, build, e2e) |
| Audits A (content), B (visual), C (code and security) | Findings and fixes in docs/QUALITY.md |
| HackerTube-style browsing: filter panel, Best first, list search, icon rail, YouTube-style watch layout | Playwright on desktop and Pixel 7; screenshots compared with hackertube.org |
| Keyboard shortcuts (`/`, `j`/`k`, `Enter`, `l`, `w`, `h`, `?`) and a search heading ("Results for …") | tests/e2e/shortcuts.spec.ts on desktop and Pixel 7 |

## Production refresh status (re-checked 2026-11-12, 16:50 UTC run still failed)

The site is live at https://nba-tube.vercel.app and Vercel deploys every push
to `main` (each build syncs the latest videos). The every-10-minutes refresh is
**not running yet**, for three reasons that need the owner:

1. **GitHub Actions is blocked by a billing lock.** Every job, including the
   scheduled `Refresh videos` run, fails with "The job was not started because
   your account is locked due to a billing issue". Fix: GitHub > Settings >
   Billing and plans.
2. **No Vercel Deploy Hook exists.** Create one: Vercel > nba-tube > Settings >
   Git > Deploy Hooks, name `refresh`, branch `main`.
3. **The repository has no `VERCEL_DEPLOY_HOOK` secret or `SITE_URL` variable.**
   Add them under GitHub > nba-tube > Settings > Secrets and variables >
   Actions (`SITE_URL` = `https://nba-tube.vercel.app`). Creating these from
   the CLI was attempted and refused by the session's permission policy for
   writing secrets, so it was left to the owner.

Once all three are done, the `Refresh videos` workflow can be started by hand
from the Actions tab to confirm it, and then runs on its own.

## Next useful work

1. A verified head-coach list per team, to label coach press conferences whose
   titles omit "Coach" (KNOWN_ISSUES.md).
2. Run one live Data API sync once a key exists, and compare its rejection
   report with the feed sync.

## Resume

```
git switch dev && git pull
npm ci
npm run lint && npm run typecheck && npm run test
npm run build && npm run test:e2e
```
