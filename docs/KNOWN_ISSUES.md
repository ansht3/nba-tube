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

## Keyless mode

- Without `YOUTUBE_API_KEY`, only each channel's 15 newest uploads are seen per
  sync, there are no durations, and the length filter is hidden.
- `data/overrides.json` inclusions only take effect in feed mode while the video
  is among its channel's 15 newest uploads. The API mode fetches them by id.
- A video that becomes unplayable between syncs still shows a card. Its watch
  page then shows "This video can't be played here" with a link to YouTube.

## Not verified

- The GitHub Pages workflow (`.github/workflows/deploy.yml`) has not run: Pages
  is not enabled on the repository. The same build was checked locally with
  `NEXT_PUBLIC_BASE_PATH=/nba-tube`.
- The Data API path is covered by unit tests with recorded response shapes, but
  has not been run against the live API because no key was available.
- Browser tests run in Chromium only (desktop and Pixel 7 emulation). Safari and
  Firefox were not tested.
