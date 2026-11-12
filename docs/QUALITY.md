# Quality record

Results of checks that were actually run, with what they found and what was
done about it.

## Test suites (2026-11-11)

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Clean |
| Types | `npm run typecheck` | Clean |
| Unit and integration | `npm run test` | 233 passed (Vitest) |
| Production build | `npm run build` | 363 static pages from a 315-video catalog |
| Browser | `npm run test:e2e` | 55 passed, 3 skipped by design (desktop and Pixel 7, Chromium) |
| Accessibility | axe, inside `test:e2e` | No serious or critical violations on 11 pages, light and dark |

The unit suite covers the classifier against real titles from the 31 channels,
the Data API client (paging, partial responses, invalid key, exhausted quota,
rate limits, a key that must never appear in errors), the feed reader, oEmbed,
the sync (idempotency, deduplication, removal of deleted, private and
unembeddable videos, pruning, the 30-day metadata limit, quota exhaustion
mid-run, one channel failing), filters and search, and every localStorage
module including corrupted and blocked storage.

## Defects found by the checks

| Found by | Defect | Priority | Fix |
| --- | --- | --- | --- |
| Browser test, card to watch page | Section and team pages rendered "Show more (97 left)" with no cards. A constant exported from a `"use client"` module reached server components as a client reference. | P0 | Moved the constant to `src/lib/site.ts`; rule added to CLAUDE.md |
| Content audit of a live sync | A Raptors hosted show "THE SHOOTAROUND with …" was filed as a pregame media session. | P1 | Shootaround rule now needs a session word or a person speaking, and rejects "The Shootaround" |
| Content audit | Knicks recaps titled "X Defeat the Y" and score-line recaps were rejected as low confidence. | P2 | Two exact-team-name and score-plus-result rules; 6 recaps added, nothing else changed |
| Visual audit, 390 px | Browse filters filled the whole first screen on a phone. | P3 | Filters fold behind a toggle below 640 px |
| Code review (Opus) | Feed sync deleted published videos when oEmbed failed to answer. | P2 | Inconclusive checks keep the stored record; regression test |
| Code review | A build long after the last sync could publish API metadata older than 30 days. | P2 | The loader drops API records past 30 days |
| Code review | One failed `videos.list` batch aborted the whole API sync. | P2 | The batch is reported and skipped |
| Code review | An unexpected API value (such as a thumbnail host) could write a catalog the build rejects. | P3 | Every record is schema-checked before storing |
| Code review | A saved date outside the Date range crashed library pages. | P3 | Rejected when reading storage |
| Code review | Feed rechecks erased durations learned from the API. | P3 | Kept |
| Code review | Toggle buttons changed their names as well as `aria-pressed`; focus was lost when a removed row or confirm control disappeared. | P3 | Stable names; focus moves to the list summary, empty state or Cancel |
| Docs check (Haiku) | README and CLAUDE.md linked missing docs; YOUTUBE_SETUP overstated feed-mode refresh; "documentaries" had no rule. | P3 | Docs written and corrected; documentary rule added |

## Content classification on real data

Live keyless sync of all 31 channels, 465 recent long-form uploads:

| Outcome | Count |
| --- | --- |
| Accepted | 315 |
| Rejected: no rule matched (kept out on purpose) | 89 |
| Rejected: podcasts, documentaries, all-access, hype, studio commentary | 28 |
| Rejected: Shorts, hashtag clips, teasers, live | 27 |
| Rejected: reaction | 2 |

Every accepted title in the audit sample was read by hand. Remaining
mislabels are listed in KNOWN_ISSUES.md.
