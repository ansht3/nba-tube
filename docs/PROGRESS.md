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

## Scalable catalog work (2026-11-16, branch `dev`, pushed; pull request #1 into `main` is open)

Built and verified locally: visible refresh failures, a catalog repository with
file and Postgres implementations passing one contract, idempotent storage with
atomic versions, a leased incremental ingestion worker, cached paginated feeds,
version and updates endpoints, infinite scrolling with position restore,
in-site playlist playback, library export and import, same-game related videos,
`/api/health`, and a load test. Manual steps and unverified items:
docs/OPERATIONS.md. The plan: docs/MIGRATION.md.

## Architecture hardening (2026-11-22, branch `dev`)

Six small changes, each with its reasoning in docs/DECISIONS.md:

- Layer boundaries are lint errors (#15): the site never imports ingestion or
  storage, the contract imports neither, `src/catalog` and `src/db` never import
  `src/lib`. The Best first formula and the ingestion-health type moved into
  `src/catalog` to close the last two cycles.
- Playability rechecks no longer extend the 30-day life of Data API metadata (#16):
  a new `provenance.embedCheckedAt` moves on a recheck, `metadataCheckedAt` only on a
  real metadata fetch. Three regression tests fail against the old behaviour.
- CI fails when coverage drops under a floor set from the measured baseline (#17).
- The architecture, README and deployment docs no longer describe the static export.

Verified locally: lint, typecheck, 527 unit tests, the Worker bundle, the production
build and 180 Playwright tests (desktop and Pixel 7). Not verified: the Data API
paths against the live API, Neon, Cloudflare and a Vercel deploy (unchanged; see
docs/OPERATIONS.md). Still open, in order: the owner steps below, the coach-name
roster, one live Data API sync.

## Production refresh status (re-checked 2026-11-16)

The site is live at https://nba-tube.vercel.app. The refresh is **not
publishing**, and it is now visible instead of silent:

- The live catalog is from 2026-11-12 (82 hours old). A real keyless sync adds
  168 videos it does not have.
- `Refresh videos` runs on GitHub (the earlier billing lock is gone) but ran
  green while doing nothing. It now fails when the hook or `SITE_URL` is missing
  or when a video has waited over an hour.
- Remaining owner steps (cannot be done from code):
  1. Vercel > nba-tube > Settings > Git > Deploy Hooks: create `refresh` for
     branch `main` and copy the URL.
  2. GitHub > nba-tube > Settings > Secrets and variables > Actions: secret
     `VERCEL_DEPLOY_HOOK` = that URL; variable `SITE_URL` =
     `https://nba-tube.vercel.app`.
  3. Run `Refresh videos` once from the Actions tab and read its summary.

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
