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
| `q` | search words (all must match, any order, accents and case ignored), up to 80 characters |
| `date` | `day`, `week` or `month` |
| `duration` | `short` (under 5 min), `medium` (5 to 20), `long` (over 20); videos with no known duration never match |
| `sort` | `latest` (default) or `oldest` |

Unknown parameters and repeated parameters are **errors (400)**. That is
deliberate: a CDN keys on the full URL, and ignored parameters would let anyone
create unlimited cache entries.

Response: `{ "videos": [...], "total": n, "nextCursor": "..." | null, "version": "..." }`.
`total` counts every match, not just this page. Pagination is keyset-based, so a
video published while someone is browsing is never repeated or skipped.

## `GET /api/videos/:id`
`{ "video": {...} }`, `404` if the id is not in the catalog, `400` if it is not
11 characters of letters, digits, `-` or `_`.

## Caching
- Lists: `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=300`.
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
