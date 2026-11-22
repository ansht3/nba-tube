# Architecture

NBATube is a Next.js app served by `next start` (Vercel in production). Its
catalog has two interchangeable homes behind one interface: a JSON file built by
the sync scripts (the default, and what a fresh clone runs on), or Postgres kept
current by a separate ingestion Worker. One variable, `DATABASE_URL`, chooses
between them (see "Catalog access" below and docs/MIGRATION.md).

The file path, which is also the fallback:

```
 data/sources.json          verified channels (the allowlist)
        |
        v
 discovery                  Data API (with a key) or Atom feeds (without)
        |
        v
 classification             deterministic rules, one reason per decision
        |
        v
 catalog merge              dedupe, refresh, prune, sort
        |
        v
 data/catalog.json          generated, never committed
        |
        v
 next build                 prerendered pages, refreshed every minute (ISR)
        |
        v
 .next + next start         Vercel or any Node host; playback in YouTube's player
```

The database path replaces the sync and the file, not the site:

```
 data/sources.json + overrides.json   bundled into the Worker at deploy time
        |
        v
 Cloudflare Worker (cron, 5 min)      src/ingest/run.ts: lease, discover, classify,
        |                             embed-check, one transaction per run
        v
 Postgres (Neon)                      videos, versions, runs, checkpoints, lease
        |
        v
 PostgresCatalogRepository            read by pages and /api/*, cached at the CDN
```

## Two halves that share one contract

| Half | Location | Knows about |
| --- | --- | --- |
| Ingestion | `src/ingest/`, `scripts/` | YouTube endpoints, quota, rules |
| Website | `src/app/`, `src/components/`, `src/lib/` | The catalog file only |
| Contract | `src/catalog/` | The video schema, content types, teams |

The website never imports from `src/ingest/`. It reads the catalog through
`src/catalog/load.ts` and has no idea how a video was found. Replacing YouTube
discovery, or adding a second method, changes nothing in the interface.

## Catalog modes

The loader picks the first file that exists:

1. `data/catalog.json`: written by `npm run sync`. Its `mode` is `api` when a
   key was used and `feed` when the keyless Atom feeds were used.
2. `data/seed/catalog.json`: a small committed snapshot so that a fresh clone
   runs offline with real videos. Its `mode` is `seed`.

The site shows which mode it was built from on the About page, so a seed build
is never mistaken for a live one.

## A video record

Fields fall into three groups, kept apart in the type so the interface cannot
confuse what YouTube said with what NBATube decided.

- **From YouTube, shown unchanged:** `youtubeId`, `title`, `channelId`,
  `channelTitle`, `thumbnailUrl`, `publishedAt`, `durationSeconds`,
  `embeddable`.
- **NBATube labels:** `contentType`, `gamePhase`, `teamIds`, `playerNames`,
  `reason` (the rule that accepted the video).
- **Provenance:** `publisherType`, `discoveryMethod`, `verificationStatus`,
  `metadataCheckedAt`.

`durationSeconds` and `embeddable` are `null` when the discovery method cannot
know them. The interface hides what it does not have and never fills a gap.

## Classification

`src/ingest/classify.ts` runs an ordered list of rules over a video's title and
whatever metadata is available. The first rule that matches decides. Every
outcome, accept or reject, carries a rule id, so any catalog entry can be traced
to the line that let it in. Unmatched videos are rejected as `LOW_CONFIDENCE`.

`data/overrides.json` holds manual inclusions and exclusions by video id, for
the cases the rules get wrong.

## The website

- Next.js App Router on a normal Node server (DECISIONS #1; there is no static
  export). Pages are generated once and refreshed at most every 60 seconds
  (`revalidate` in `src/app/layout.tsx`); a video published since the last build
  renders on its first request (`/watch/[id]` has `dynamicParams = true`).
  Team pages come from the fixed team list.
- Listing pages are server components that ask the catalog repository.
- Search, filters and infinite scrolling are client components that call the
  public read API (`/api/videos`, `/api/version`, `/api/updates`; docs/API.md)
  one page at a time. They do not download the catalog. `/catalog.json` and
  `/status.json` still exist as the published form of the file catalog.
- Likes, watch later, history, playlists and settings live in `localStorage`
  under versioned keys. `src/lib/storage/` owns reading, validating and writing
  them. No request ever carries this data.
- The player is YouTube's iframe on `youtube-nocookie.com`. The IFrame Player
  API is attached only to learn about playback errors, so that an unavailable
  video shows a clear fallback instead of a grey box.

## Deployment

The app is built with `npm run build` (`.next`) and run with `next start` on
Vercel. `vercel.json` syncs the file catalog before each build, continuing from
the live `/catalog.json`, so a build needs no commit to carry videos forward.
Security headers are set in `next.config.ts`, not `vercel.json`, so
`next start` and Vercel send the same ones.

Freshness has two mechanisms during the migration. The old one is a scheduled
GitHub Actions job that checks the channel feeds every 10 minutes and calls a
Vercel Deploy Hook only when there is something new (docs/DEPLOYMENT.md). The new
one is the Worker writing to Postgres, which needs no deploy at all
(docs/OPERATIONS.md). The old one is retired after the Worker has run cleanly
for a week.

## Catalog access

Pages and routes do not read the catalog file. They ask a `CatalogRepository`
(`src/catalog/repository.ts`) through `getCatalogRepository()`
(`src/catalog/server.ts`): a page of videos for a filter, a count, one video,
related videos, per-team counts, channels, and catalog metadata. Order is
always newest first with ties by YouTube id, and cursors are built from parsed
timestamps, so a cursor stays valid while newer videos are inserted.

`FileCatalogRepository` answers from `data/catalog.json` (or the committed
seed) exactly as the site always has. A database implementation will answer the
same questions with indexed queries; see docs/MIGRATION.md. The two JSON
artifacts `/catalog.json` and `/status.json` still read the file directly: they
are the published form of the file catalog.

