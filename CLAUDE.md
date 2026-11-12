# NBATube

A static website of official NBA videos (game and player highlights, pregame and
postgame media sessions) taken only from the league's and the 30 teams' verified
YouTube channels. No recommendation algorithm, no comments, no accounts. Inspired
by HackerTube. MIT licensed.

@AGENTS.md

## Layout

- `src/catalog/` the contract shared by both halves: schema, teams, content types, source registry, selectors, loader.
- `src/ingest/` discovery and classification. Never imported by the site.
- `src/app/`, `src/components/` the site. Reads the catalog only through `src/catalog/`.
- `src/lib/storage/` everything kept in localStorage (lists, playlists, settings).
- `scripts/sync.ts` builds `data/catalog.json` (git-ignored). `data/seed/catalog.json` is the committed fallback.
- `data/sources.json` the channel allowlist. `data/overrides.json` manual include and exclude by video id.

## Commands

```
npm run dev          # dev server on :3000
npm run sync         # rebuild data/catalog.json (Data API with YOUTUBE_API_KEY, keyless feeds without)
npm run seed         # rebuild the committed seed (keyless)
npm run lint && npm run typecheck && npm run test
npm run build        # static export to out/
npm run test:e2e     # Playwright against out/ (build first)
npm run preview      # serve out/ on :3000
```

## Rules that matter

- Static export only: no server actions, cookies, redirects, ISR or request-time code.
- Do not export constants from a `"use client"` file for server components to use: they arrive as client references. Shared values go in `src/lib/`.
- Videos only from approved channels in `data/sources.json`. Never keyword search.
- Classification is deterministic. Every decision names a rule id. Reject when unsure. Add a real-title fixture to `src/ingest/classify.test.ts` with every rule change.
- Never invent teams, players, dates or durations. Unknown is `null` or empty.
- Show YouTube titles and thumbnails unchanged. NBATube labels are separate elements.
- Nothing drawn over the player. No autoplay.
- `YOUTUBE_API_KEY` stays in the environment. Never logged, committed or sent to the client.
- API-derived metadata is never committed (30-day storage rule). Only the keyless seed is.

## Workflow

- Work on `dev`; fast-forward `main` only after lint, typecheck, unit tests, build and e2e pass.
- Small, specific commits. Push often.
- State of the work: `docs/PROGRESS.md`. Defects and test results: `docs/QUALITY.md`, `docs/KNOWN_ISSUES.md`. Why things are the way they are: `docs/DECISIONS.md`.
