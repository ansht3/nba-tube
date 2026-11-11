import { CATALOG_SCHEMA_VERSION, type Catalog, type CatalogMode, type Video } from "@/catalog/schema";
import type { Source } from "@/catalog/sources";
import type { CandidateVideo } from "./candidate";
import type { RejectionReason } from "./classify";
import { decide } from "./decide";
import { mapWithConcurrency } from "./http";
import type { Overrides } from "./overrides";
import { YouTubeApiError, type YouTubeApi } from "./youtube/api";
import type { EmbedCheck } from "./youtube/oembed";

export interface SyncLimits {
  /** API mode: how many of each channel's newest uploads to look at. */
  uploadsPerChannel: number;
  /** Videos published longer ago than this leave the catalog. */
  retentionDays: number;
  maxVideos: number;
  /**
   * YouTube's Developer Policies allow stored metadata to be at most 30 days
   * old. A record that could not be refreshed within this window is deleted.
   */
  maxMetadataAgeDays: number;
  /** Feed mode: how long a stored video is trusted before its availability is checked again. */
  recheckAfterHours: number;
  /** Keeps at most this many videos per channel. Used to build a small seed. */
  perSourceLimit: number | null;
}

export const DEFAULT_LIMITS: SyncLimits = {
  uploadsPerChannel: 50,
  retentionDays: 45,
  maxVideos: 3000,
  maxMetadataAgeDays: 30,
  recheckAfterHours: 24,
  perSourceLimit: null,
};

export interface RejectedVideo {
  youtubeId: string;
  title: string;
  channelTitle: string;
  rejection: RejectionReason;
  ruleId: string;
}

export interface SyncReport {
  mode: "api" | "feed";
  startedAt: string;
  discovered: number;
  total: number;
  added: number;
  removed: number;
  rejectedByReason: Partial<Record<RejectionReason, number>>;
  rejected: RejectedVideo[];
  sourceErrors: { channelId: string; name: string; message: string }[];
  quotaUnitsUsed: number;
  /** Set when the run could not finish, for example because the quota ran out. */
  stoppedEarly: string | null;
}

interface CommonOptions {
  sources: Source[];
  /** The catalog from the last run, or null on a first run. */
  previous: Catalog | null;
  overrides: Overrides;
  now: Date;
  limits?: Partial<SyncLimits>;
  /** Written into the catalog. A seed is built in feed mode but labelled "seed". */
  catalogMode?: CatalogMode;
}

export interface ApiSyncOptions extends CommonOptions {
  mode: "api";
  api: YouTubeApi;
}

export interface FeedSyncOptions extends CommonOptions {
  mode: "feed";
  fetchFeed: (source: Source) => Promise<CandidateVideo[]>;
  checkEmbed: (youtubeId: string) => Promise<EmbedCheck>;
}

export type SyncOptions = ApiSyncOptions | FeedSyncOptions;

export interface SyncResult {
  catalog: Catalog;
  report: SyncReport;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const API_BATCH = 50;
const FEED_CONCURRENCY = 4;
const EMBED_CONCURRENCY = 6;

/** What discovery learned about the videos that might belong in the catalog. */
interface Discovery {
  /** Fresh metadata, keyed by video id. */
  candidates: Map<string, CandidateVideo>;
  /** Stored videos that YouTube confirmed are gone. */
  gone: Set<string>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStale(video: Video, now: Date, hours: number): boolean {
  return now.getTime() - Date.parse(video.provenance.metadataCheckedAt) > hours * HOUR_MS;
}

/** Rebuilds a candidate from a stored record so it can be re-decided with a refreshed title. */
function candidateFromStored(video: Video, title: string): CandidateVideo {
  return {
    youtubeId: video.youtubeId,
    title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    durationSeconds: null,
    embeddable: true,
    privacyStatus: null,
    liveBroadcast: null,
    isVertical: null,
    discoveryMethod: "channel-feed",
  };
}

async function discoverWithApi(options: ApiSyncOptions, limits: SyncLimits, report: SyncReport): Promise<Discovery> {
  const { api, sources, previous, overrides } = options;
  const wanted = new Set<string>();

  // An invalid key fails on this first call and aborts the run: nothing useful can follow.
  const channels = await api.getChannels(sources.map((source) => source.channelId));

  for (const source of sources) {
    const channel = channels.get(source.channelId);
    if (!channel) {
      report.sourceErrors.push({ channelId: source.channelId, name: source.name, message: "YouTube did not return this channel" });
      continue;
    }
    try {
      const ids = await api.listPlaylistVideoIds(channel.uploadsPlaylistId, limits.uploadsPerChannel);
      for (const id of ids) wanted.add(id);
    } catch (error) {
      if (error instanceof YouTubeApiError && error.kind === "quota-exceeded") {
        report.stoppedEarly = error.message;
        break;
      }
      // One broken channel must not cost the other thirty their update.
      report.sourceErrors.push({ channelId: source.channelId, name: source.name, message: describeError(error) });
    }
  }

  // Stored videos are fetched again too: that is what refreshes their metadata
  // and reveals the ones that were deleted or made private.
  for (const video of previous?.videos ?? []) wanted.add(video.youtubeId);
  for (const entry of overrides.include) wanted.add(entry.youtubeId);

  const candidates = new Map<string, CandidateVideo>();
  const gone = new Set<string>();
  const ids = [...wanted];

  for (let start = 0; start < ids.length && !report.stoppedEarly; start += API_BATCH) {
    const batch = ids.slice(start, start + API_BATCH);
    try {
      for (const candidate of await api.getVideos(batch)) candidates.set(candidate.youtubeId, candidate);
      // The API answered for this batch, so an id it left out no longer exists publicly.
      for (const id of batch) if (!candidates.has(id)) gone.add(id);
    } catch (error) {
      if (error instanceof YouTubeApiError && error.kind === "quota-exceeded") {
        report.stoppedEarly = error.message;
      } else {
        throw error;
      }
    }
  }

  return { candidates, gone };
}

async function discoverWithFeeds(options: FeedSyncOptions, limits: SyncLimits, report: SyncReport): Promise<Discovery> {
  const { sources, previous, now } = options;
  const candidates = new Map<string, CandidateVideo>();
  const gone = new Set<string>();

  const feeds = await mapWithConcurrency(sources, FEED_CONCURRENCY, async (source) => {
    try {
      return await options.fetchFeed(source);
    } catch (error) {
      report.sourceErrors.push({ channelId: source.channelId, name: source.name, message: describeError(error) });
      return [];
    }
  });
  for (const candidate of feeds.flat()) candidates.set(candidate.youtubeId, candidate);

  // A feed only lists a channel's 15 newest uploads. Older stored videos have
  // dropped out of it, so they are re-verified one by one once they are stale.
  const stored = (previous?.videos ?? []).filter(
    (video) => !candidates.has(video.youtubeId) && isStale(video, now, limits.recheckAfterHours),
  );
  await mapWithConcurrency(stored, EMBED_CONCURRENCY, async (video) => {
    const check = await options.checkEmbed(video.youtubeId);
    if (check.status === "unavailable") gone.add(video.youtubeId);
    if (check.status === "ok") candidates.set(video.youtubeId, candidateFromStored(video, check.title));
    // "unknown" leaves the stored record alone. It ages out if it can never be checked.
  });

  return { candidates, gone };
}

/** Feed entries say nothing about embedding, so every newly accepted video is checked before it is stored. */
async function confirmEmbeddable(
  accepted: Video[],
  options: FeedSyncOptions,
  limits: SyncLimits,
  report: SyncReport,
): Promise<Video[]> {
  const stored = new Map((options.previous?.videos ?? []).map((video) => [video.youtubeId, video]));

  const checked = await mapWithConcurrency(accepted, EMBED_CONCURRENCY, async (video) => {
    if (video.embeddable === true) return video;

    // A recently verified video is trusted without another request. It keeps
    // its old check time, so it does become stale and is verified again later.
    const before = stored.get(video.youtubeId);
    if (before?.embeddable === true && !isStale(before, options.now, limits.recheckAfterHours)) {
      const provenance = { ...video.provenance, metadataCheckedAt: before.provenance.metadataCheckedAt };
      return { ...video, embeddable: true, provenance };
    }

    const check = await options.checkEmbed(video.youtubeId);
    if (check.status === "ok") return { ...video, embeddable: true };

    const ruleId = check.status === "unavailable" ? "embed-unavailable" : "embed-check-inconclusive";
    recordRejection(report, video, "UNAVAILABLE_VIDEO", ruleId);
    return null;
  });

  return checked.filter((video) => video !== null);
}

function recordRejection(
  report: SyncReport,
  video: { youtubeId: string; title: string; channelTitle: string },
  rejection: RejectionReason,
  ruleId: string,
) {
  report.rejectedByReason[rejection] = (report.rejectedByReason[rejection] ?? 0) + 1;
  report.rejected.push({
    youtubeId: video.youtubeId,
    title: video.title,
    channelTitle: video.channelTitle,
    rejection,
    ruleId,
  });
}

/** Newest first. The id breaks ties so that two runs over the same data give the same file. */
export function sortVideos(videos: Video[]): Video[] {
  return [...videos].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.youtubeId.localeCompare(b.youtubeId),
  );
}

function prune(videos: Video[], now: Date, limits: SyncLimits): Video[] {
  const oldestPublished = now.getTime() - limits.retentionDays * DAY_MS;
  const oldestChecked = now.getTime() - limits.maxMetadataAgeDays * DAY_MS;

  let kept = sortVideos(videos).filter(
    (video) =>
      Date.parse(video.publishedAt) >= oldestPublished &&
      Date.parse(video.provenance.metadataCheckedAt) >= oldestChecked,
  );

  if (limits.perSourceLimit !== null) {
    const perChannel = new Map<string, number>();
    kept = kept.filter((video) => {
      const count = (perChannel.get(video.channelId) ?? 0) + 1;
      perChannel.set(video.channelId, count);
      return count <= limits.perSourceLimit!;
    });
  }

  return kept.slice(0, limits.maxVideos);
}

/**
 * Builds the next catalog from the previous one and whatever YouTube reports
 * now. Running it twice over the same inputs produces the same catalog: videos
 * are keyed by id, so nothing is ever duplicated.
 */
export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const limits: SyncLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const { now, previous, overrides } = options;

  const report: SyncReport = {
    mode: options.mode,
    startedAt: now.toISOString(),
    discovered: 0,
    total: 0,
    added: 0,
    removed: 0,
    rejectedByReason: {},
    rejected: [],
    sourceErrors: [],
    quotaUnitsUsed: 0,
    stoppedEarly: null,
  };

  const discovery =
    options.mode === "api"
      ? await discoverWithApi(options, limits, report)
      : await discoverWithFeeds(options, limits, report);
  report.discovered = discovery.candidates.size;
  if (options.mode === "api") report.quotaUnitsUsed = options.api.unitsUsed;

  const sourcesByChannel = new Map(options.sources.map((source) => [source.channelId, source]));
  const videos = new Map((previous?.videos ?? []).map((video) => [video.youtubeId, video]));
  for (const id of discovery.gone) videos.delete(id);

  const accepted: Video[] = [];
  for (const candidate of discovery.candidates.values()) {
    const decision = decide(candidate, sourcesByChannel.get(candidate.channelId), overrides, now);
    if (decision.accepted) {
      accepted.push(decision.video);
    } else {
      // A stored video can stop qualifying: its title changed, a rule was
      // tightened, or it was added to the manual exclusions.
      videos.delete(candidate.youtubeId);
      recordRejection(report, candidate, decision.rejection, decision.ruleId);
    }
  }

  const confirmed = options.mode === "feed" ? await confirmEmbeddable(accepted, options, limits, report) : accepted;
  const confirmedIds = new Set(confirmed.map((video) => video.youtubeId));
  for (const video of accepted) if (!confirmedIds.has(video.youtubeId)) videos.delete(video.youtubeId);
  for (const video of confirmed) videos.set(video.youtubeId, video);

  const result = prune([...videos.values()], now, limits);

  const before = new Set((previous?.videos ?? []).map((video) => video.youtubeId));
  const after = new Set(result.map((video) => video.youtubeId));
  report.total = result.length;
  report.added = result.filter((video) => !before.has(video.youtubeId)).length;
  report.removed = [...before].filter((id) => !after.has(id)).length;

  return {
    catalog: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      mode: options.catalogMode ?? options.mode,
      generatedAt: now.toISOString(),
      videos: result,
    },
    report,
  };
}
