# Known issues

Factual list of what does not work yet or works with a limitation. Newest at
the top.

## Content

- **Coaches without the word "Coach" in the title are labelled as plain
  postgame sessions.** "Taylor Jenkins Postgame Press Conference" is a coach,
  but without a verified roster the classifier cannot tell a coach's name from a
  player's. The video is still in the right section (Postgame).
- **Player names are not tagged.** `labels.playerNames` is always empty for the
  same reason. Search still finds players because it matches titles.
- **Some legitimate videos are rejected.** About 90 of 465 recent official
  uploads match no rule, for example "Stephen Curry CLUTCH FLURRY Defeats Magic"
  (probably highlights, but the title does not say so). They can be added by id
  in `data/overrides.json`.
- **A few highlight packages are mislabelled game versus player.** "Bryce Hopkins
  PUT ON A SHOW | Game Highlights DEN vs. TOR" is filed as game highlights.
- **Opponent teams are not tagged on team-channel videos.** A Hawks postgame
  presser after a Lakers game appears under the Hawks only. The league channel's
  full-game recaps are tagged with both teams.

## Database and worker (built, not yet running anywhere)

- The Neon adapter, the Cloudflare Worker and a Vercel deploy of the dynamic app
  have never been run: there were no accounts. The SQL and the ingestion logic
  are tested on real Postgres (PGlite) and the Worker bundles for a non-Node
  runtime. docs/OPERATIONS.md lists the steps and the unverified items.
- `/catalog.json` is still produced at build time. With `DATABASE_URL` set it is
  stale by design; the sync and the refresh check read it, nothing in the site does.
- "Play all" and in-site Next/Previous work for playlists, Liked and Watch later
  (`?list=liked`, `?list=later`). History has none by design. Videos you watch are
  not removed from Watch later automatically.
- Best first treats a date later than the check time as the check time (a premiere
  or wrong date cannot outrank real news). Rows already in a database keep their old
  key until the video is next written, or `npm run db:import` is run again.
- Load numbers are from PGlite on a laptop, not Neon.

## Open findings from the 2026-11-19 review

Three read-only reviews (API and SQL, ingestion and database, client storage and
feed) found the issues fixed on `dev` that day, and these that are **not fixed**.
"Confirmed" means I read the code path myself; "reported" means only the reviewer did.

- **oEmbed rechecks reset the 30-day clock for API-derived data (confirmed in
  code, behaviour reasoned).** A recheck stamps a fresh `metadataCheckedAt` without
  refreshing durations, so a Data API duration can live up to the 45-day limit
  instead of 30 days. No fix without a way to tell "embed rechecked" from "metadata
  refreshed".
- **The legacy build-time sync can still shrink the live catalog (confirmed, reduced).**
  If the published `catalog.json` stays unreachable for a whole build (after two
  retries), the build starts fresh and publishes only the newest uploads per
  channel. The build log now says so and what it costs; a 404 (first deploy) is
  expected and quiet. Failing the build instead is not an option as wired: the
  build command swallows a failed sync and deploys the committed seed, which is
  smaller still. Relevant only without `DATABASE_URL`.
- **`script-src 'unsafe-inline'` in the CSP (confirmed).** The usual Next.js
  trade-off without nonces. The site has no accounts or user content.

## Keyless mode

- Without `YOUTUBE_API_KEY`, only each channel's 15 newest uploads are seen per
  sync, there are no durations, and the length filter is hidden.
- `data/overrides.json` inclusions only take effect in feed mode while the video
  is among its channel's 15 newest uploads. The API mode fetches them by id.
- A video that becomes unplayable between syncs still shows a card. Its watch
  page then shows "This video can't be played here" with a link to YouTube.

## Not verified

- The scheduled refresh (`.github/workflows/refresh.yml`) runs on GitHub but
  could not publish anything: the deploy hook and `SITE_URL` were never set, and
  the job used to succeed anyway. It now fails when they are missing. Until the
  owner adds them (docs/DEPLOYMENT.md) the live site only updates on a push to
  `main`. Checked against production on 2026-11-16: 168 videos waiting, the
  oldest for 78 hours. Checked again on 2026-11-21: the live catalog was generated
  on 2026-11-12 (209 hours earlier), `/status.json` was a 404, pull request #1
  (`dev` into `main`, 72 commits) was still open and the repository had no secret
  or variable. The scheduled run on `main` is still the old version that reports
  success without publishing.
- Vercel has not built the site yet. `vercel.json`'s build command and headers
  were run locally.
- The Data API path is covered by unit tests with recorded response shapes, but
  has not been run against the live API because no key was available.
- Browser tests run in Chromium only (desktop and Pixel 7 emulation). Safari and
  Firefox were not tested.
