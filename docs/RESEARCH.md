# Research notes

Collected on 2026-11-11, before any application code was written. Each claim is
marked as **observed** (seen directly in a response or a rendered page),
**documented** (stated in an official page that was read) or **assumed** (a
reasonable inference that was not confirmed).

## 1. HackerTube, the reference product

Source: `https://hackertube.org/` and `/about`, plus its public JSON endpoints.

### Observed

- Every path returns the same ~68 KB HTML document with inline CSS and
  JavaScript. A small client-side router (`history.pushState`) swaps the
  contents of one `<main>` element. There is no framework and no build output.
- The page talks to a JSON API on the same origin: `/api/feed`, `/api/list`,
  `/api/browse`, `/api/video`, `/api/related`, `/api/search`, `/api/docs`,
  `/api/playlists`, `/api/stats`, `/api/config`. The server is nginx and sends
  a strict Content-Security-Policy that only allows images from `i.ytimg.com`
  and frames from `youtube-nocookie.com` and `youtube.com`.
- Layout: a fixed 56 px top bar (menu button, wordmark, search box, about and
  theme buttons), a 240 px left sidebar that collapses to 72 px, and a card grid
  of `repeat(auto-fill, minmax(300px, 1fr))`. Under 800 px the sidebar becomes a
  drawer behind a scrim and the grid becomes one column. The watch page puts
  the player and details in a main column and an "up next" list in a 402 px
  side column, which stacks below the player under 1100 px.
- Navigation: Home, Longs (videos over an hour), Liked, History, Watch later,
  Categories, Playlists, Settings.
- Cards show the thumbnail, a duration badge, a two-line title, the channel,
  views and age. A watch-later button sits on the thumbnail and appears on
  hover or focus.
- Filters are plain links. Each option is one URL parameter (`date`, `type`,
  `dur`, `sort`, ...), so a filtered page is a shareable URL, and active
  filters show as removable chips.
- All personal state is in `localStorage`: `likes`, `dislikes`, `seen` (capped
  at 200), `later`, `theme`, `collapsed`, `frames`. There are no accounts.
- Playback uses `https://www.youtube-nocookie.com/embed/<id>?rel=0` in an
  iframe. With the "video frames" setting on, a poster frame is shown first and
  the iframe loads on click.
- Keyboard shortcuts: `/` search, `j`/`k` move, `Enter` open, `l` like, `w`
  watch later, `h` home, `?` help.
- "Play all on YouTube" builds a `watch_videos?video_ids=` link from up to 50
  ids on the page.
- Loading and empty states are single lines of muted text ("Loading…",
  "Nothing here yet.", "No videos match these filters.").

### Documented (its own About page)

- Video data comes from the YouTube Data API. The site says it does not
  redistribute YouTube metadata in its data export "because YouTube's terms
  don't allow redistributing it".
- The Home feed is personalised from likes, and search is semantic.

### Not known

The server implementation is private. Nothing here claims to describe it.

### What NBATube takes and leaves

Taken: the sidebar-plus-grid shape, local-only state, URL-parameter filters,
the privacy-enhanced embed, quiet one-line empty states, a few keyboard
shortcuts.

Left out on purpose: a feed steered by likes, comments, AI-written summaries,
dislikes and semantic search. NBATube lists videos newest first and says so.

## 2. YouTube integration

Sources read: the YouTube API Services Developer Policies, Required Minimum
Functionality, the Data API quota page, getting-started, the
`playlistItems.list`, `videos.list` and `channels.list` references, and the
IFrame player parameters page.

### Quota (documented)

- Default allocation: 10,000 units per day, reset at midnight Pacific Time.
  `search.list` has its own bucket of 100 calls per day.
- `channels.list`, `playlistItems.list` and `videos.list` cost 1 unit per call.
- `playlistItems.list` returns at most 50 items per page and does not include
  duration or embeddable status, so `videos.list` is needed for those.
- `channels.list` supports `forHandle` and returns the uploads playlist in
  `contentDetails.relatedPlaylists.uploads`.

A full sync of 31 channels is one `channels.list` call, 31 `playlistItems.list`
calls and roughly one `videos.list` call per 50 videos: well under 100 units.
Searching YouTube by keyword would cost far more and return unverified
publishers, so the pipeline never searches.

### Storage (documented, section III.E.4 of the Developer Policies)

Non-authorized API data may be stored temporarily, but for no more than 30
calendar days, after which it must be refreshed or deleted. No exception for
video or channel ids was found. Consequences for this project:

- The catalog built from the Data API is a generated file. It is not committed.
- Every record carries the time its metadata was last checked, and the sync
  drops records that could not be refreshed within 30 days.

### Player rules (documented, Required Minimum Functionality)

- Nothing may be drawn over any part of the player, including its controls.
- The player viewport must be at least 200 by 200 px.
- Autoplay may not start until more than half of the player is visible.
- The player may not be modified beyond what the API documents, and ads may not
  be blocked or altered.

### Player parameters (documented)

- `rel=0` no longer hides related videos. It limits them to the same channel.
- `modestbranding` is deprecated and has no effect.
- `autoplay` defaults to 0.

### Other policy points (documented)

- An API client must link to the YouTube Terms of Service and have a privacy
  policy that says it uses YouTube API Services and links to the Google Privacy
  Policy (III.A).
- API data must not be replaced with independently calculated data, and derived
  information must be clearly marked as not coming from YouTube (III.E.4.h).
  NBATube therefore shows titles and thumbnails unchanged and renders its own
  labels as separate elements.
- Clients must not replicate YouTube's core experience unless they add
  independent value (III.I.1). NBATube is a narrow, curated index that sends
  playback to the official player.

### Not confirmed from the pages read

`youtube-nocookie.com` is not mentioned in any of the pages above. It is the
domain YouTube's own "privacy-enhanced mode" embed option produces and the
reference product uses it, so NBATube uses it too, but this was not re-verified
against a policy page.

## 3. Ways to discover videos

| Option | Verdict |
| --- | --- |
| A. Hand-written list of video ids | Accurate but stale within a day during the season. Kept only as the offline seed. |
| B. YouTube Data API | The primary path: full metadata, cheap in quota, needs a key. |
| C. Channel Atom feeds | **Observed** to work without a key. Limited to the 15 newest uploads and no durations. |
| D. Registry of verified channels plus B, with C as the keyless fallback | **Chosen.** |

### Observed behaviour of the keyless endpoints

- `https://www.youtube.com/feeds/videos.xml?channel_id=<UC…>` returns the 15
  newest uploads with id, title, publish time and thumbnail. It mixes in Shorts.
- The same feed with `playlist_id=UULF<channel id without UC>` returns only
  long-form uploads. On the NBA channel, the plain feed had 6 Shorts in 15
  entries and the `UULF` feed had none. The `UULF` prefix is widely used but not
  officially documented, so the code falls back to the plain channel feed.
- `https://www.youtube.com/oembed?url=…&format=json` returns 200 with the title
  and author for an embeddable public video, 404 for an id that does not exist
  and 400 for a malformed id.

## 4. Verifying the source channels

A display name proves nothing. While resolving handles, these all turned out
**not** to be the official channel:

| Handle | What it is |
| --- | --- |
| `@HoustonRockets` | An unrelated channel with 5 subscribers |
| `@HoustonRocketsNBA`, `@RocketsNBA` | Unrelated, under 30 subscribers |
| `@Mavs` | A personal channel |
| `@DallasMavs` | Named "Dallas Mavericks" with a verified badge, but dormant: 117 subscribers and one upload from 2013 |
| `@MavsTV` | A third-party fan media channel |

Method used for each of the 31 sources:

1. Fetch the team's official site (`nba.com/<team>`, and `mavs.com` for Dallas)
   and take the YouTube link it publishes. This worked for 25 teams.
2. For the other five (Brooklyn, Golden State, Houston, Indiana, Milwaukee) the
   official site is rendered in the browser and exposed no link to a plain HTTP
   fetch. Their channels were accepted on three signals together: YouTube's
   verification badge in the channel header, a six-figure subscriber count, and
   uploads that match the team's current games.
3. Resolve the link to its permanent channel id (`UC…`), which is what the
   registry stores. Handles can be renamed, ids cannot.

Each registry entry records which of the two methods applied and when.

## 5. What official uploads look like

A sample of 465 recent long-form uploads from the 31 channels was read by hand.
Findings that shaped the classifier:

- Game phase is usually explicit: "Postgame Press Conference", "Postgame Media
  Availability", "Post Game", "Postgame Sound", "Walk-Off Interview",
  "Shootaround Media Availability", "Shootaround Sound".
- Every team has its own title format. Rules have to match vocabulary, not
  position.
- Coaches are only sometimes marked ("Head Coach Quin Snyder", "Coach Nurse").
  Other channels give just a name ("Kenny Atkinson Post Game"), which cannot be
  told apart from a player without a roster.
- Highlights come in three kinds: the game ("FULL GAME HIGHLIGHTS", "Game
  Highlights"), one player ("Cameron Boozer Highlights vs Toronto Raptors",
  "Kyrie Irving (35 points) vs. Brooklyn Nets") and compilations ("Top 10 Plays
  of the Night", "Plays of the Week").
- The league channel titles full-game highlights as
  `AWAY at HOME | FULL GAME HIGHLIGHTS | <date>`, which is regular enough to
  read both teams from.
- Official channels also post plenty that does not belong here: podcasts,
  all-access documentaries, hype videos, dance team features, sponsor segments,
  teasers and hashtag-titled clips. About four in ten uploads in the sample were
  of this kind.
