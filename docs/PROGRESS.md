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

## Not done, needs the owner

- **Turn on GitHub Pages** if a public site is wanted: see docs/DEPLOYMENT.md.
  The workflow is in place and gated by the `PAGES_ENABLED` variable.
- **Add `YOUTUBE_API_KEY`** (locally in `.env`, and as a repository secret for
  the scheduled deploy) for durations and deeper history. Everything works
  without it.
- **Review the "NBATube" name** for trademark issues before a public launch.

## Next useful work

1. A verified head-coach list per team, to label coach press conferences whose
   titles omit "Coach" (KNOWN_ISSUES.md).
2. Run one live Data API sync once a key exists, and compare its rejection
   report with the feed sync.
3. Keyboard shortcuts (`j`/`k`/`l`/`w`), as on HackerTube. Only `/` exists now.

## Resume

```
git switch dev && git pull
npm ci
npm run lint && npm run typecheck && npm run test
npm run build && npm run test:e2e
```
