import type { Source } from "@/catalog/sources";
import type { CandidateVideo } from "./candidate";
import { decide } from "./decide";
import type { Overrides } from "./overrides";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Videos on the channel feeds that the site would publish but does not have.
 * Anything else (too old, rejected by the rules) must not count, or a refresh
 * would rebuild again and again and never catch up.
 */
export function pendingCandidates(input: {
  published: ReadonlySet<string>;
  feeds: CandidateVideo[];
  sources: Source[];
  overrides: Overrides;
  now: Date;
  retentionDays: number;
}): CandidateVideo[] {
  const bySource = new Map(input.sources.map((source) => [source.channelId, source]));
  const oldest = input.now.getTime() - input.retentionDays * DAY_MS;
  return input.feeds
    .filter((candidate) => !input.published.has(candidate.youtubeId))
    .filter((candidate) => Date.parse(candidate.publishedAt) >= oldest)
    .filter((candidate) => decide(candidate, bySource.get(candidate.channelId), input.overrides, input.now).accepted);
}

/**
 * current:     nothing is waiting.
 * pending:     something is waiting, but only for as long as a rebuild normally takes.
 * stuck:       something has been waiting longer than that, so refreshing is not working.
 */
export type RefreshStatus = "current" | "pending" | "stuck";

/** A rebuild takes minutes, so a video still missing an hour after upload means the refresh is broken. */
export const STUCK_AFTER_MINUTES = 60;

export function refreshStatus(
  pending: CandidateVideo[],
  now: Date,
  stuckAfterMinutes = STUCK_AFTER_MINUTES,
): { status: RefreshStatus; oldestPendingMinutes: number | null } {
  if (pending.length === 0) return { status: "current", oldestPendingMinutes: null };
  const oldestPendingMinutes = Math.max(...pending.map((candidate) => Math.round((now.getTime() - Date.parse(candidate.publishedAt)) / MINUTE_MS)));
  return { status: oldestPendingMinutes > stuckAfterMinutes ? "stuck" : "pending", oldestPendingMinutes };
}
