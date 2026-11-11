# Decisions

Short records of choices that were not obvious. Newest at the bottom.

## 1. Static export instead of a running server

The catalog changes a few times a day at most and every visitor sees the same
videos. Prerendering everything means free hosting, no cold starts and no API
key anywhere near a browser. The cost is that a video page exists only for
videos in the catalog at build time, so the site is rebuilt on each sync.

## 2. Cache Components left off

`create-next-app` now turns on `cacheComponents`. It exists to mix static shells
with streamed dynamic content, and a static export has no dynamic content. It is
off to keep the mental model small: pages read a file at build time.

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
