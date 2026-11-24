import { videoSchema, type Video } from "@/catalog/schema";
import type { Source } from "@/catalog/sources";
import { canonical, publishVideos, pruneExpired, pruneHistory } from "@/db/catalog-store";
import type { Db } from "@/db/db";
import { acquireLease, releaseLease, renewLease } from "@/db/lease";
import type { CandidateVideo } from "./candidate";
import { decide } from "./decide";
import { mapWithConcurrency, type FetchLike, type RetryOptions } from "./http";
import type { Overrides } from "./overrides";
import type { YouTubeApi } from "./youtube/api";
import { fetchChannelFeed } from "./youtube/feed";
import { checkEmbed } from "./youtube/oembed";

/**
 * One incremental ingestion run: discover new uploads from the official
 * channels, classify them with the same deterministic rules as the sync, and
 * write them to the database. It is safe to run on a schedule, to run twice at
 * once (a lease allows one), and to fail halfway (nothing is removed because a
 * request failed, and the catalog version only advances after the write).
 */
export interface IngestionOptions {
  /** How long one run may hold the lease. Keep it shorter than the schedule interval. */
  leaseSeconds: number;
  feedConcurrency: number;
  embedConcurrency: number;
  /** Channels polled per run, least recently attempted first. Lower it to stay inside a Worker's subrequest limit. */
  maxChannelsPerRun: number;
  /** Stored videos re-verified per run, oldest check first. */
  recheckPerRun: number;
  recheckAfterHours: number;
  retentionDays: number;
  maxMetadataAgeDays: number;
  /** The most YouTube Data API quota units one run may spend. */
  apiUnitBudget: number;
  retry: RetryOptions;
}

/** Rejections that are decisions about the publisher or an editor's call, not guesses from a title. */
const WITHDRAWING_REJECTIONS: ReadonlySet<string> = new Set(["MANUAL_EXCLUSION", "UNVERIFIED_PUBLISHER"]);

/**
 * Videos stored from a channel that is no longer approved (suspended, or taken out of data/sources.json). Such a channel
 * is never polled again, so nothing else would ever touch its videos. Nothing is removed when the approved list is
 * empty, or when it would remove most of the catalog: either is far more likely a broken configuration than an intent.
 */
async function withdrawnChannelVideos(db: Db, sources: Source[], summary: IngestionSummary): Promise<string[]> {
  if (sources.length === 0) return [];
  const approved = JSON.stringify(sources.map((source) => source.channelId));
  const [totals] = await db.query<{ n: string }>(`SELECT count(*) AS n FROM videos`);
  const rows = await db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos WHERE channel_id NOT IN (SELECT jsonb_array_elements_text($1::jsonb))`, [approved]);
  const total = Number(totals?.n ?? 0);
  if (rows.length === 0) return [];
  if (total >= MIN_SUSPECT_REMOVALS + 1 && rows.length * 2 > total) {
    summary.failed++;
    summary.message ??= `${rows.length} of ${total} stored videos belong to channels that are not approved. That is more likely a configuration mistake than an intent, so none were removed.`;
    return [];
  }
  return rows.map((row) => row.youtube_id);
}

/** At least this many removals in one batch, and more than half of it, is treated as a bad answer from YouTube and not acted on. */
const MIN_SUSPECT_REMOVALS = 3;

export const DEFAULT_INGESTION_OPTIONS: IngestionOptions = {
  leaseSeconds: 240,
  feedConcurrency: 4,
  embedConcurrency: 6,
  maxChannelsPerRun: 1000,
  recheckPerRun: 10,
  recheckAfterHours: 24,
  retentionDays: 45,
  maxMetadataAgeDays: 30,
  apiUnitBudget: 200,
  retry: { retries: 2, baseDelayMs: 500, timeoutMs: 12_000 },
};

/**
 * Time left in a run. The lease is only as long as `leaseSeconds`, and a run that outlives it loses the lease and
 * writes nothing, so the next run repeats the same slow work and also loses. Work is therefore not started once this
 * much time is gone (the lease minus a margin for the request already in flight), and whatever finished is published.
 */
interface Budget {
  expired(): boolean;
}

/** Room left for requests that are already running (a retried request can take most of a minute) and for the writes. */
const DEADLINE_MARGIN_MS = 30_000;

function createBudget(clock: () => number, leaseSeconds: number): Budget {
  const margin = Math.min(DEADLINE_MARGIN_MS, leaseSeconds * 500);
  const deadline = clock() + leaseSeconds * 1000 - margin;
  return { expired: () => clock() >= deadline };
}

const OUT_OF_TIME = "The run ran out of time before it could finish everything, so the rest waits for the next run.";

export interface IngestionDeps {
  db: Db;
  /** Milliseconds, for the run's time budget. Defaults to Date.now; tests pass a fake that they advance. */
  clock?: () => number;
  /** Approved channels only. */
  sources: Source[];
  overrides: Overrides;
  fetch: FetchLike;
  /** Optional. Adds durations, a second opinion on embedding, and recovery of uploads the feed missed. */
  api?: YouTubeApi;
  /** Unique per invocation; identifies the lease holder. */
  owner: string;
  now?: () => Date;
  options?: Partial<IngestionOptions>;
}

export interface IngestionSummary {
  status: "succeeded" | "partial" | "failed" | "skipped";
  runId: number | null;
  /** Distinct videos seen on the polled channels within the retention window. */
  discovered: number;
  /** Accepted by the classification rules (including ones already stored). */
  accepted: number;
  rejected: number;
  /** Rows inserted or changed in the database. */
  updated: number;
  /** Channels that could not be read, plus checks that were inconclusive. These are retried next run. */
  failed: number;
  /** Videos confirmed gone and removed, plus those aged out by the retention rules. */
  removed: number;
  version: number | null;
  published: boolean;
  failedChannels: { channelId: string; name: string; message: string }[];
  message?: string;
}

const LEASE_NAME = "ingestion";
const HOUR_MS = 3_600_000;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

class LeaseLostError extends Error {
  constructor() {
    super("The ingestion lease expired before the results could be written, so nothing was written.");
    this.name = "LeaseLostError";
  }
}

interface ChannelOutcome {
  source: Source;
  candidates: CandidateVideo[];
  error: string | null;
  /** Keep the channel's newest-seen time where it was. */
  holdCheckpoint?: boolean;
}

/** What recovering missed uploads produced. `failed` means the channel's checkpoint must not move past what was not recovered. */
interface Recovery {
  candidates: CandidateVideo[];
  failed: string | null;
}

interface CheckpointRow {
  channel_id: string;
  last_attempt_at: string | null;
  newest_seen_at: string | null;
}

/**
 * What a feed-based rediscovery means for a stored video. A feed entry knows
 * nothing about duration or embedding, and it would stamp a fresh check time on
 * a record nobody actually re-verified. So facts the feed cannot know, and the
 * provenance, stay as stored; only what the feed does say (title, labels, ...) can change.
 */
function mergeRediscovered(before: Video, next: Video): Video {
  return { ...next, embeddable: next.embeddable ?? before.embeddable, durationSeconds: next.durationSeconds ?? before.durationSeconds, provenance: before.provenance };
}

export async function runIngestion(deps: IngestionDeps): Promise<IngestionSummary> {
  const options = { ...DEFAULT_INGESTION_OPTIONS, ...deps.options };
  const now = (deps.now ?? (() => new Date()))();
  const { db } = deps;

  const summary: IngestionSummary = {
    status: "failed",
    runId: null,
    discovered: 0,
    accepted: 0,
    rejected: 0,
    updated: 0,
    failed: 0,
    removed: 0,
    version: null,
    published: false,
    failedChannels: [],
  };

  if (!(await acquireLease(db, LEASE_NAME, deps.owner, options.leaseSeconds))) {
    return { ...summary, status: "skipped", message: "Another ingestion run holds the lease." };
  }

  try {
    const [run] = await db.query<{ run_id: string | number }>(`INSERT INTO ingestion_runs (owner, status) VALUES ($1, 'running') RETURNING run_id`, [deps.owner]);
    summary.runId = Number(run!.run_id);

    await ingest(deps, options, now, summary, createBudget(deps.clock ?? Date.now, options.leaseSeconds));

    const anyChannelWorked = summary.failedChannels.length < Math.min(deps.sources.length, options.maxChannelsPerRun);
    // Any failed work makes the run partial, not only a failed channel: embed checks that could not be completed, or a
    // failed recheck, mean videos were neither stored nor rejected, and a status of "succeeded" would hide that.
    summary.status = summary.failedChannels.length === 0 ? (summary.failed === 0 ? "succeeded" : "partial") : anyChannelWorked ? "partial" : "failed";
  } catch (error) {
    summary.status = "failed";
    summary.message = describe(error);
  } finally {
    // Recording the outcome must never hide the outcome itself.
    try {
      if (summary.runId !== null) {
        await db.query(
          `UPDATE ingestion_runs SET finished_at = now(), status = $2, discovered = $3, accepted = $4, rejected = $5, updated = $6, failed = $7, error = $8 WHERE run_id = $1`,
          [summary.runId, summary.status, summary.discovered, summary.accepted, summary.rejected, summary.updated, summary.failed, summary.message ?? null],
        );
      }
      await releaseLease(db, LEASE_NAME, deps.owner);
    } catch (error) {
      summary.message ??= `Could not record the run: ${describe(error)}`;
    }
  }
  return summary;
}

async function ingest(deps: IngestionDeps, options: IngestionOptions, now: Date, summary: IngestionSummary, budget: Budget): Promise<void> {
  const { db, api } = deps;

  // Retention comes first and on its own. It must not depend on anything later in the run succeeding (a source
  // outage, a lost lease, an unreadable row), or the 45-day and 30-day limits would stop being enforced exactly when
  // something is wrong.
  try {
    const pruned = await pruneExpired(db, now, { retentionDays: options.retentionDays, maxMetadataAgeDays: options.maxMetadataAgeDays });
    summary.removed += pruned.deleted;
    if (pruned.deleted > 0) summary.published = true;
    // The bookkeeping tables are trimmed in the same protected step, so they cannot grow without bound.
    await pruneHistory(db, now);
  } catch (error) {
    summary.failed++;
    summary.message ??= `Retention failed: ${describe(error)}`;
  }

  const bySource = new Map(deps.sources.map((source) => [source.channelId, source]));

  // Channels attempted longest ago go first, so a limited run still reaches every channel in turn.
  const checkpoints = new Map((await db.query<CheckpointRow>(`SELECT channel_id, last_attempt_at, newest_seen_at FROM source_checkpoints`)).map((row) => [row.channel_id, row]));
  const attemptedAt = (source: Source) => Date.parse(checkpoints.get(source.channelId)?.last_attempt_at ?? "") || 0;
  const todo = [...deps.sources].sort((a, b) => attemptedAt(a) - attemptedAt(b)).slice(0, options.maxChannelsPerRun);

  const outcomes: ChannelOutcome[] = await mapWithConcurrency(todo, options.feedConcurrency, async (source) => {
    if (budget.expired()) {
      // Not read at all this run. Counted as failed so its checkpoint stays put and it is first in line next time.
      summary.failedChannels.push({ channelId: source.channelId, name: source.name, message: OUT_OF_TIME });
      summary.failed++;
      return { source, candidates: [], error: OUT_OF_TIME };
    }
    try {
      const candidates = await fetchChannelFeed(source, deps.fetch, options.retry);
      const recovery = await recoverMissed(source, candidates, checkpoints.get(source.channelId), deps, options);
      candidates.push(...recovery.candidates);
      if (recovery.failed !== null) {
        // The feed's videos are still stored. But the checkpoint must stay where it was: moving it to the feed's newest
        // would tell the next run that nothing could have been missed, and the uploads that fell off the feed stay lost.
        summary.failedChannels.push({ channelId: source.channelId, name: source.name, message: recovery.failed });
        summary.failed++;
        return { source, candidates, error: recovery.failed, holdCheckpoint: true };
      }
      return { source, candidates, error: null };
    } catch (error) {
      // One unreachable channel must not cost the others their update.
      summary.failedChannels.push({ channelId: source.channelId, name: source.name, message: describe(error) });
      summary.failed++;
      return { source, candidates: [], error: describe(error) };
    }
  });

  // Older than the retention window: it would be removed again right away, so it is never stored.
  const oldest = now.getTime() - options.retentionDays * 24 * HOUR_MS;
  const unique = new Map<string, CandidateVideo>();
  for (const outcome of outcomes) {
    for (const candidate of outcome.candidates) if (Date.parse(candidate.publishedAt) >= oldest) unique.set(candidate.youtubeId, candidate);
  }
  summary.discovered = unique.size;

  const stored = await readStored(db, [...unique.keys()], summary);
  const remove: string[] = [];
  const toWrite: Video[] = [];
  const toVerify: Video[] = [];

  for (const candidate of unique.values()) {
    const decision = decide(candidate, bySource.get(candidate.channelId), deps.overrides, now);
    if (!decision.accepted) {
      summary.rejected++;
      // A policy decision about a video already published takes it down. Other rejections (a title rule, a missing
      // duration) do not: a keyless feed cannot tell what the API knew, so they must never delete.
      if (WITHDRAWING_REJECTIONS.has(decision.rejection) && stored.has(candidate.youtubeId)) remove.push(candidate.youtubeId);
      continue;
    }
    summary.accepted++;
    const before = stored.get(candidate.youtubeId);
    if (!before) toVerify.push(decision.video);
    else {
      const merged = mergeRediscovered(before, decision.video);
      if (canonical(merged) !== canonical(before)) toWrite.push(merged);
    }
  }

  toWrite.push(...(await verifyNew(toVerify, deps, options, summary, budget)));

  remove.push(...(await withdrawnChannelVideos(db, deps.sources, summary)));
  toWrite.push(...(await recheckStored(deps, options, now, new Set(unique.keys()), remove, summary, budget)));

  // The database decides who holds the lease. Losing it means another run may be writing, so this one must not.
  if (!(await renewLease(db, LEASE_NAME, deps.owner, options.leaseSeconds))) throw new LeaseLostError();

  const result = await publishVideos(db, toWrite, { mode: api ? "api" : "feed", runId: summary.runId, remove: [...new Set(remove)] });
  summary.updated = result.inserted + result.updated;
  summary.removed += result.removed;
  summary.version = result.version;
  summary.published ||= result.published;

  // Checkpoints advance only now that the writes are durable. A failed write leaves them where they were, so nothing is skipped.
  await writeCheckpoints(db, outcomes);
}

/** The feed lists only a channel's newest uploads. If all of them are newer than the last run saw, uploads may have fallen off the end; the API can fetch them. */
async function recoverMissed(source: Source, feed: CandidateVideo[], checkpoint: CheckpointRow | undefined, deps: IngestionDeps, options: IngestionOptions): Promise<Recovery> {
  const none: Recovery = { candidates: [], failed: null };
  const api = deps.api;
  if (!api || !checkpoint?.newest_seen_at || feed.length === 0) return none;
  const lastSeen = Date.parse(checkpoint.newest_seen_at);
  if (!feed.every((candidate) => Date.parse(candidate.publishedAt) > lastSeen)) return none;
  if (api.unitsUsed >= options.apiUnitBudget) return none;
  try {
    const channel = (await api.getChannels([source.channelId])).get(source.channelId);
    if (!channel) return none;
    const known = new Set(feed.map((candidate) => candidate.youtubeId));
    const ids = (await api.listPlaylistVideoIds(channel.uploadsPlaylistId, 50)).filter((id) => !known.has(id));
    return { candidates: ids.length > 0 ? await api.getVideos(ids) : [], failed: null };
  } catch (error) {
    return { candidates: [], failed: `Recovering missed uploads failed: ${describe(error)}` };
  }
}

async function readStored(db: Db, ids: string[], summary: IngestionSummary): Promise<Map<string, Video>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query<{ youtube_id: string; data: unknown }>(`SELECT youtube_id, data FROM videos WHERE youtube_id IN (SELECT jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(ids)]);
  const stored = new Map<string, Video>();
  for (const row of rows) {
    const parsed = videoSchema.safeParse(row.data);
    // A row that no longer matches the schema is left alone and reported. Throwing would fail every run that meets it.
    if (parsed.success) stored.set(row.youtube_id, parsed.data);
    else summary.message ??= `Stored video ${row.youtube_id} does not match the schema and was skipped.`;
  }
  return stored;
}

/** A feed entry says nothing about embedding, so a new video is checked before it is stored. */
async function verifyNew(videos: Video[], deps: IngestionDeps, options: IngestionOptions, summary: IngestionSummary, budget: Budget): Promise<Video[]> {
  let skipped = false;
  const checked = await mapWithConcurrency(videos, options.embedConcurrency, async (video) => {
    if (video.embeddable === true) return video; // already known: no request, so no reason to wait
    if (budget.expired()) {
      skipped = true;
      return null;
    }
    const check = await checkEmbed(video.youtubeId, deps.fetch, options.retry);
    if (check.status === "ok") return { ...video, embeddable: true };
    if (check.status === "unavailable") summary.rejected++;
    // Inconclusive: nothing was learned, so it is neither stored nor rejected for good. The feed offers it again next run.
    else summary.failed++;
    return null;
  });
  if (skipped) {
    // Not stored and not rejected: the feed offers these again next run.
    summary.failed++;
    summary.message ??= OUT_OF_TIME;
  }
  return checked.filter((video) => video !== null);
}

/** Re-verifies the stored videos checked longest ago. Only a confirmed "gone" removes one; an inconclusive check changes nothing. */
async function recheckStored(deps: IngestionDeps, options: IngestionOptions, now: Date, skip: Set<string>, remove: string[], summary: IngestionSummary, budget: Budget): Promise<Video[]> {
  if (options.recheckPerRun <= 0 || budget.expired()) return [];
  const cutoff = new Date(now.getTime() - options.recheckAfterHours * HOUR_MS).toISOString();
  const rows = await deps.db.query<{ youtube_id: string; data: unknown }>(
    // Due is judged by the later of the last metadata fetch and the last recheck (src/catalog/embed-check.ts), so a
    // recheck moves a video to the back of the line without touching metadata_checked_at, which is the age of
    // API-derived data. GREATEST ignores a NULL embedCheckedAt, so rows written before it existed still qualify.
    `SELECT youtube_id, data FROM videos
     WHERE GREATEST(metadata_checked_at, (data->'provenance'->>'embedCheckedAt')::timestamptz) < $1
     ORDER BY GREATEST(metadata_checked_at, (data->'provenance'->>'embedCheckedAt')::timestamptz) ASC, youtube_id LIMIT $2`,
    [cutoff, options.recheckPerRun + skip.size],
  );
  const stale: Video[] = [];
  for (const row of rows.filter((candidate) => !skip.has(candidate.youtube_id)).slice(0, options.recheckPerRun)) {
    const parsed = videoSchema.safeParse(row.data);
    if (parsed.success) stale.push(parsed.data);
    else summary.message ??= `Stored video ${row.youtube_id} does not match the schema and was skipped.`;
  }

  const gone: string[] = [];
  const refreshed = await mapWithConcurrency(stale, options.embedConcurrency, async (video) => {
    if (budget.expired()) return null; // rechecks are routine: whatever is skipped is first in line next time
    const check = await checkEmbed(video.youtubeId, deps.fetch, options.retry);
    if (check.status === "unavailable") gone.push(video.youtubeId);
    else if (check.status === "unknown") summary.failed++;
    // oEmbed confirms playability and nothing else, so only embedCheckedAt moves. metadataCheckedAt stays the age of
    // whatever the Data API last supplied (duration), which YouTube's terms limit to 30 days from that fetch.
    else return { ...video, embeddable: true, provenance: { ...video.provenance, embedCheckedAt: now.toISOString() } };
    return null;
  });

  // A few videos going away at once is a takedown. Most of a batch going away at once is far more likely to be YouTube
  // answering us with an error status for every request (blocked addresses, an outage), and acting on it would empty the
  // catalog a batch at a time. Nothing is removed then; the next run checks again.
  if (gone.length >= MIN_SUSPECT_REMOVALS && gone.length * 2 > stale.length) {
    summary.failed += gone.length;
    summary.message ??= `YouTube reported ${gone.length} of ${stale.length} checked videos unavailable at once. That is more likely a block or an outage than ${gone.length} takedowns, so none were removed.`;
  } else {
    remove.push(...gone);
  }
  return refreshed.filter((video) => video !== null);
}

const UPSERT_CHECKPOINTS = `
  INSERT INTO source_checkpoints (channel_id, last_attempt_at, last_success_at, newest_seen_at, consecutive_failures, last_error)
  SELECT e->>'channelId', now(), CASE WHEN e->>'error' IS NULL THEN now() END, (e->>'newest')::timestamptz,
         CASE WHEN e->>'error' IS NULL THEN 0 ELSE 1 END, e->>'error'
  FROM jsonb_array_elements($1::jsonb) AS e
  ON CONFLICT (channel_id) DO UPDATE SET
    last_attempt_at = now(),
    last_success_at = COALESCE(EXCLUDED.last_success_at, source_checkpoints.last_success_at),
    newest_seen_at = GREATEST(EXCLUDED.newest_seen_at, source_checkpoints.newest_seen_at),
    consecutive_failures = CASE WHEN EXCLUDED.last_error IS NULL THEN 0 ELSE source_checkpoints.consecutive_failures + 1 END,
    last_error = EXCLUDED.last_error`;

async function writeCheckpoints(db: Db, outcomes: ChannelOutcome[]): Promise<void> {
  if (outcomes.length === 0) return;
  const rows = outcomes.map(({ source, candidates, error, holdCheckpoint }) => {
    const newest = candidates.reduce<number>((latest, candidate) => Math.max(latest, Date.parse(candidate.publishedAt)), 0);
    return { channelId: source.channelId, newest: newest > 0 && !holdCheckpoint ? new Date(newest).toISOString() : null, error };
  });
  await db.query(UPSERT_CHECKPOINTS, [JSON.stringify(rows)]);
}
