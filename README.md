# NBATube

A calm place to watch official NBA video: game highlights, player highlights,
and pregame and postgame media sessions, taken only from the league's and the
30 teams' own YouTube channels. No recommendation algorithm, no comments, no
account.

NBATube is an independent open-source project. It is not affiliated with the
NBA, its teams, any broadcaster, YouTube or Google. Videos play in YouTube's own
embedded player and are never downloaded or rehosted.

## Run it

Requires Node.js 20.9 or newer.

```
npm install
npm run dev
```

Open http://localhost:3000. It works straight away from a committed sample of
about 200 real official videos (`data/seed/catalog.json`).

To fetch the latest videos:

```
npm run sync     # keyless by default; uses the YouTube Data API if YOUTUBE_API_KEY is set
npm run dev
```

See [docs/YOUTUBE_SETUP.md](docs/YOUTUBE_SETUP.md) for the optional API key.

## What it does

- **Home**: the newest highlights, postgame, pregame and interview videos, plus your teams' shelf if you pick any.
- **Sections**: Highlights, Pregame, Postgame, Interviews.
- **Teams**: a page per team.
- **Browse**: search and filter by section, type, team, source and length (with an API key). Filters live in the URL.
- **Watch**: YouTube's official player, the publisher, a direct YouTube link and related videos chosen by simple rules (same team, same kind, same channel).
- **Your library**: likes, watch later, history and playlists, stored only in your browser.
- **Settings**: theme, density, home sections, favourite teams, history on or off.

## How videos are chosen

1. Only channels in [data/sources.json](data/sources.json), each verified against the team's official website or YouTube's verification badge.
2. A fixed set of title rules ([src/ingest/classify.ts](src/ingest/classify.ts)) keeps highlights and media sessions and rejects podcasts, documentaries, Shorts, fan edits, AI clips, reaction, gaming and betting content. Unclear titles are left out.
3. [data/overrides.json](data/overrides.json) corrects individual videos by id.

## Development

```
npm run lint
npm run typecheck
npm run test        # unit tests (Vitest)
npm run build       # static site in out/
npm run test:e2e    # browser tests (Playwright) against out/
npm run preview     # serve out/ locally
```

More: [architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md),
[research](docs/RESEARCH.md), [deployment](docs/DEPLOYMENT.md),
[progress](docs/PROGRESS.md), [known issues](docs/KNOWN_ISSUES.md).

## License

MIT for the code. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the content and trademarks it does not cover.
