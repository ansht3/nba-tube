# Public read API

Same-origin JSON, no authentication, no cookies. Served from the catalog
repository: Postgres when `DATABASE_URL` is set, the JSON file otherwise.

## `GET /api/videos`
A page of videos, newest first (ties by YouTube id).

| Parameter | Values |
|---|---|
| `limit` | 1 to 48, default 24 |
| `cursor` | the `nextCursor` of the previous page; only valid with the same `sort` |
| `section` | `highlights`, `pregame`, `postgame`, `interviews` |
| `team` | a team code, e.g. `LAL` |
| `type` | one or more content types, comma separated |
| `channel` | a YouTube channel id |
| `ids` | up to 48 comma-separated video ids: returns just those that are in the catalog (to check saved videos) |
| `q` | search words (all must match, any order, accents and case ignored), up to 80 characters |
| `date` | `day`, `week` or `month` |
| `duration` | `short` (under 5 min), `medium` (5 to 20), `long` (over 20); videos with no known duration never match |
| `sort` | `latest` (default), `oldest`, or `best` (the published Best first order; it does not depend on the time of day, so it pages with a stable cursor) |

Unknown parameters and repeated parameters are **errors (400)**. That is
deliberate: a CDN keys on the full URL, and ignored parameters would let anyone
create unlimited cache entries.

Response: `{ "videos": [...], "total": n, "nextCursor": "..." | null, "version": "..." }`.
`total` counts every match, not just this page. Pagination is keyset-based, so a
video published while someone is browsing is never repeated or skipped.

## `GET /api/videos/:id`
`{ "video": {...} }`, `404` if the id is not in the catalog, `400` if it is not
11 characters of letters, digits, `-` or `_`.

## `GET /api/version`
`{ "version": "...", "newestId": "...", "newestPublishedAt": "...", "total": n }`,
about 100 bytes. The version changes whenever ingestion publishes a change.
Clients poll this instead of downloading the catalog.

## `GET /api/updates?since=<video id>`
The videos newer than one the client already has, under the same filters as its
feed (`section`, `team`, `type`, `channel`, `q`, `date`, `duration`, `limit`).
`cursor` and `sort` are rejected. The marker must be the newest video **in the
client's own filtered feed**.

`{ "videos": [...newest first], "count": n, "hasMore": bool, "reset": bool, "version": "..." }`
- `hasMore`: there are more new videos than `limit`; the client should reload its
  feed from the top instead of splicing.
- `reset`: the marker video is no longer in the catalog, so what is new cannot be
  told; the client should reload.

The marker is found inside the newest-first page, so "newer" is exact, ties
included, with no timestamp rounding.

## How the site uses them
Every page polls `/api/version` about every five minutes (randomised by up to
20%, doubling after failures up to 30 minutes), only while the tab is visible,
and checks immediately when a hidden tab returns (at most once a minute). Only
when the version differs does it call `/api/updates`. It then shows "N new
videos". It never reloads anything by itself. "Show" refreshes the page's data
in place; on a watch page, where a video may be playing, the notice only offers
a link that opens the new videos in a new tab.

## Caching
- Lists: `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=300`.
  Version and updates: `s-maxage=15, stale-while-revalidate=60`.
  A single video: `s-maxage=300, stale-while-revalidate=3600`.
- Every success has a weak `ETag`. For a list it is derived from the catalog
  **version** and the normalised query, so an `If-None-Match` that matches is
  answered `304` after one tiny version lookup, without running the list query.
  A query with an upload window (`date`) also expires with the clock minute.
- Errors are `no-store`. A database failure is a `503` with a generic message;
  the cause is only in the server log.

## Errors
`{ "error": "..." }` with status 400 (bad request or cursor), 404 (unknown
video) or 503 (catalog unavailable).
