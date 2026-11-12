# YouTube setup

NBATube works without any key. With one, the catalog gets durations, older
uploads and stronger availability checks.

| | Without a key | With `YOUTUBE_API_KEY` |
| --- | --- | --- |
| Discovery | Public channel feeds | YouTube Data API v3 |
| Uploads per channel | 15 newest | 50 newest (configurable) |
| Durations, length filter | No | Yes |
| Embeddable check | oEmbed, per video | From the API response |
| Shorts and live streams | Filtered by title and the long-form feed | Also by shape and broadcast status |

## Get a key (free)

1. Open the Google Cloud console and create a project.
2. Enable **YouTube Data API v3** for it.
3. Under Credentials, create an **API key**. Restrict it to the YouTube Data API v3.
4. Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY=...`.

The key is read only by `scripts/sync.ts`. It is never bundled into the site and
never printed.

## Commands

```
npm run sync                 # first sync, then incremental refreshes
npm run sync -- --dry-run    # report what would change, write nothing
npm run sync -- --mode=feed  # force the keyless path
npm run build                # rebuild the site from the new catalog
```

A sync prints what it added, removed and rejected (with reasons) and writes the
full report to `data/sync-report.json`.

## Quota and cost

The default quota is 10,000 units per day and the API is free within it. A full
sync of 31 channels uses about 31 + (videos ÷ 50) + 1 units, typically under 100.
Running it every three hours uses well under 1,000 units a day. The sync never
calls `search.list`. If the quota runs out mid-run, the previous catalog is kept
and the report says so.

## Storage rules

YouTube's Developer Policies allow API metadata to be stored for at most 30 days
before it is refreshed or deleted. The sync refreshes every stored video on each
run, and drops any record whose metadata is older than 30 days. `data/catalog.json`
is git-ignored for the same reason: a commit cannot be refreshed.
