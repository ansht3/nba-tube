# Decisions

Short records of choices that were not obvious. Newest at the bottom.

## 1. A normal Next server instead of a static export

*Reverses the original decision (static export), 2026-11-16.*

The site began as a static export: prerendered pages, free hosting, no API key
near a browser. The cost was that new videos needed a rebuild, and on
2026-11-16 the rebuild trigger had silently stopped, leaving the live catalog 82
hours stale. docs/MIGRATION.md moves ingestion out of the deploy path, which
needs API routes, so the export is gone.

Pages are still generated once and served from the CDN; each is refreshed from
the catalog at most every minute (`revalidate = 60` in the root layout), and a
video published since the last build renders on its first request. Without a
`DATABASE_URL` the site reads the same JSON file as before, so nothing changes
until the database is switched on.

## 2. Cache Components left off

`create-next-app` now turns on `cacheComponents`. It exists to mix static shells
with streamed dynamic content. It stays off to keep the mental model small:
pages are cached whole and refreshed on a timer (`revalidate`), and API
responses set their own `Cache-Control`.

## 3. Verified channels only, never search

Videos come only from channels in `data/sources.json`. Keyword search would cost
100 times the quota and return fan edits, AI clips and reaction channels that
then have to be filtered out. Starting from the publisher removes that whole
class of mistake. See RESEARCH.md section 4 for how each channel was verified.

## 4. Only the league and the 30 teams are approved for now

Broadcaster channels mix studio debate, betting segments and other sports with
the interviews this site wants. They are left out until someone writes and
tests per-channel rules for them. The registry supports a `candidate` status so
a channel can be recorded without being ingested.

## 5. Rules, not a model, decide what is included

Classification is a list of regular expressions with tests built from real
titles. It is cheap, repeatable, and every decision names the rule that made
it. A language model would be more flexible and impossible to audit.

## 6. Reject when unsure

A title that matches no rule is rejected, even from an official channel. About
four in ten official uploads are podcasts, documentaries and promotions. Missing
a good video is a smaller problem than showing a hype reel as a highlight, and
`data/overrides.json` can add a missed video by id.

## 7. Content types follow what titles can prove

The types are game highlights, player highlights, top plays, pregame, postgame,
coach press conference, media availability and interview. There is no "player
press conference" type: without a roster, "Kenny Atkinson Post Game" and "Sam
Merrill Post Game" look the same. A session is labelled as a coach's only when
the title says "Coach" and names nobody else.

## 8. Team tags come from the publisher, with one exception

A video is tagged with the team that published it. Opponents are not read from
team-channel titles. The exception is the league channel's full-game highlights,
whose `AWAY at HOME | FULL GAME HIGHLIGHTS` format is regular enough to trust:
both names must match the team table exactly or no team is assigned.

## 9. No player tags yet

`playerNames` exists in the schema but the pipeline leaves it empty. Filling it
needs a verified roster source. Search still finds players because it matches
the title.

## 10. One id per video

The schema has `youtubeId` and no separate internal id. YouTube is the only
provider, and a second id would be a copy of the first.

## 11. Generated API data is not committed

The Developer Policies allow storing API data for 30 days at most. A commit is
permanent. `data/catalog.json` is therefore ignored by git and rebuilt by the
sync. The committed seed is small, comes from the public feeds and oEmbed rather
than the Data API, and is refreshed by `npm run seed`.

## 12. Dates are shown in Eastern Time

Games are scheduled in ET and a late game is published after midnight UTC.
Formatting with a fixed zone also keeps server-rendered and client-rendered
text identical, which avoids hydration mismatches.

## 13. Personal lists keep a small copy of the title

Saved lists store the video id, title and channel at the time of saving. When a
video later leaves the catalog, the list can still say what it was and link to
YouTube instead of showing an anonymous broken row.

## 14. Development on `dev`, verified states on `main`

Work is committed to `dev` and pushed often. `main` is only fast-forwarded to a
commit that has passed lint, type checking, tests and a production build.

## 15. Layer boundaries are lint errors, not conventions

*2026-11-22.*

The code is split into layers with one-way dependencies: the site (`src/app`,
`src/components`, `src/lib`) reads the catalog through `src/catalog`; ingestion
(`src/ingest`) and storage (`src/db`) never import the site; `src/catalog` is the
contract and imports neither ingestion nor the site. An import graph of the
repository showed all of this already true, but only because nobody had broken it.
The Worker deploys `src/ingest` on its own, so one UI import slipping into it
would pull React into a bundle that cannot run it, and a page importing `src/db`
would bypass the repository that lets the site run without a database.

`eslint.config.mjs` now forbids those imports (alias and relative forms alike)
with `no-restricted-imports`, one object per file set, since a later object
replaces an earlier one's patterns instead of adding to them. Tests are exempt:
they wire layers together on purpose. `src/catalog/server.ts` is the single file
in the contract layer allowed to import `src/db`, because it is where the
repository is chosen.

*Update, same day:* the one gap left open here is closed. `src/lib/rank.ts` (the
Best first formula) imported only from `src/catalog`, so it moved there, and the
`IngestionHealth` type that `src/db` took from `src/lib/api/health` now sits next
to `CatalogRepository`. `src/catalog` and `src/db` may no longer import `src/lib`
at all, and the lint rules say so.

## 16. Two clocks for one record: metadata age and playability checks

*2026-11-22.*

`provenance.metadataCheckedAt` was asked to answer two questions: how old is the
data the YouTube Data API gave us (its terms allow storing it for 30 days), and
when did we last confirm the video still plays. A recheck answers only the
second, but stamping the one field also reset the first, so a duration could be
kept up to the 45-day ceiling instead of 30. KNOWN_ISSUES recorded this as
unfixable without a way to tell the two apart.

The record now carries both. `metadataCheckedAt` moves only when YouTube
supplies metadata; the optional `embedCheckedAt` moves on an oEmbed recheck.
Rechecks rotate on the later of the two (`lastEmbedCheckMs`), computed in SQL with
`GREATEST`, so a checked video goes to the back of the line and the same ten rows
are not picked forever. Retention and the Best first clamp keep reading
`metadataCheckedAt`.

Alternatives rejected: a real `embed_checked_at` column (a migration and a second
copy of a value already in the validated JSON, for at most a few thousand rows),
and shortening the recheck so the clock never matters (it would still overstate
how fresh the API data is). The field is optional, so no schema version bump,
migration or backfill: a stored row without it behaves exactly as before until
its first recheck.

## 17. A coverage floor, set from a measurement

*2026-11-22.*

CI reported coverage with no threshold, on the reasoning that a number picked
before a baseline existed would be arbitrary and a failing gate would hide real
failures. The baseline is now known (77.4% statements, 80.7% branches, 74.3%
functions, 78.1% lines over `src`, `worker` and `scripts`; components and pages are
covered by the browser tests and are not in the denominator).

`vitest.config.mts` sets a floor about two points under it: 75 / 78 / 72 / 76.
It is a ratchet, not a target: it exists so a change that deletes or skips tests
fails CI, which a summary nobody reads does not. Raise it when coverage rises.
Lowering it to land a change defeats the point; add the test instead. There is no
per-file threshold, because the contract file `repository-contract.ts` and
generated or test-only code would distort it.

## 18. Team-channel opponents come from exact names only

*2026-11-24.*

A team channel's video used to be tagged with that team only, so a postgame
presser after Hawks vs. Lakers never appeared on the Lakers page. `opponentOf`
(src/ingest/decide.ts) now reads the opponent from "vs", "at" or "@" in the
title: the first exact nickname from the team table in the next three words
("Raptors", "Trail Blazers", "Cavs"), or an exact upper-case code ("HOU"). When
that name is the channel's own team, the name just before the keyword is used.

Cities are not matched, because "Los Angeles" is two teams and "LA" is used for
both; "Highlights vs Milwaukee" therefore stays untagged. Lower-case codes are
words, not teams. This keeps the rule the league channel already follows:
anything that is not an exact team name gets no tag rather than a guess. A wrong
opponent would put a video on a team page it has nothing to do with, which costs
more than a missing one. Stored rows keep their old tags until the video is next
written; no backfill, since team pages are a convenience over search.
