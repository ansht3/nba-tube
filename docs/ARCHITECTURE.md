# Architecture

NBATube is a static website generated from one JSON file. A separate set of
Node scripts builds that file from a registry of verified YouTube channels.
Nothing runs on a server after deployment.

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
 next build                 static HTML for every route and every video
        |
        v
 out/                       any static host; playback in YouTube's player
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

- Next.js App Router, built with `output: "export"`. Every page is prerendered,
  including one page per video under `/watch/<id>/`.
- Listing pages are server components that read the catalog at build time.
- Search, filters and the personal lists are client components. They fetch
  `catalog.json`, a static file emitted by a route handler, once per visit.
- Likes, watch later, history, playlists and settings live in `localStorage`
  under versioned keys. `src/lib/storage/` owns reading, validating and writing
  them. No request ever carries this data.
- The player is YouTube's iframe on `youtube-nocookie.com`. The IFrame Player
  API is attached only to learn about playback errors, so that an unavailable
  video shows a clear fallback instead of a grey box.

## Deployment

`npm run build` writes `out/`, hosted on Vercel. Each Vercel build syncs first
and continues from the live `/catalog.json`, so no commit is needed to update
videos. A scheduled GitHub Actions job checks the channel feeds every 10 minutes
and calls a Vercel Deploy Hook only when there is a new video to publish. See
docs/DEPLOYMENT.md.
