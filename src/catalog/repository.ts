import type { ContentType, SectionId } from "./content-types";
import { bestKey } from "./rank";
import type { Catalog, Video } from "./schema";

/**
 * How the site, the API and the ingestion read the catalog. The first
 * implementation reads the JSON file the site is built from; the database
 * implementation answers the same questions without loading every video.
 *
 * Order is always newest first, ties broken by YouTube id ascending, so a
 * cursor stays valid while new videos are inserted.
 */
export interface VideoFilter {
  section?: SectionId;
  teamId?: string;
  /** Videos about at least one of these teams (for a viewer's favourite teams). */
  anyTeamIds?: string[];
  contentTypes?: ContentType[];
  channelId?: string;
  /** Only these videos (at most 48 are useful at once). Used to check which saved videos are still in the catalog. */
  ids?: string[];
  /** Every word must appear in the video's search text (title, channel, type, teams), in any order. */
  q?: string;
  /** Only videos published at or after this time, in milliseconds since the epoch. */
  publishedAfterMs?: number;
  /** Seconds, min inclusive and max exclusive (null = no upper limit). A video with no known duration never matches. */
  duration?: { min: number; max: number | null };
}

/**
 * latest: newest first. oldest: exactly the reverse, ties included.
 * best: the published "Best first" order (see src/catalog/rank.ts), ties newest first then by id.
 */
export type VideoSort = "latest" | "oldest" | "best";

export interface VideoQuery extends VideoFilter {
  limit: number;
  sort?: VideoSort;
  /** An opaque cursor from a previous page's nextCursor. It only works with the sort that issued it. */
  cursor?: string | null;
}

export interface VideoPage {
  videos: Video[];
  /** Videos matching the filter, ignoring the cursor and limit. */
  total: number;
  nextCursor: string | null;
}

export interface CatalogMeta {
  /** Changes whenever the published catalog changes. */
  version: string;
  generatedAt: string;
  mode: Catalog["mode"];
  total: number;
  newestPublishedAt: string | null;
  /** The id of the newest video (by the catalog order), what a client says it has seen up to. */
  newestId: string | null;
}

export interface ChannelSummary {
  channelId: string;
  channelTitle: string;
  count: number;
}

/** What the database knows about ingestion. Only a database-backed repository can answer. */
export interface IngestionHealth {
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  channelsTracked: number;
  /** Channels that have failed three or more runs in a row. */
  channelsFailing: number;
  /** When the least recently read channel last succeeded. */
  oldestSourceSuccessAt: string | null;
}

export interface CatalogRepository {
  meta(): Promise<CatalogMeta>;
  list(query: VideoQuery): Promise<VideoPage>;
  count(filter: VideoFilter): Promise<number>;
  get(youtubeId: string): Promise<Video | null>;
  related(video: Video, limit: number): Promise<Video[]>;
  countsByTeam(): Promise<Map<string, number>>;
  channels(): Promise<ChannelSummary[]>;
  /** Every id, for build-time page generation. Not used once pages render on demand. */
  allIds(): Promise<string[]>;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("The cursor is not valid.");
    this.name = "InvalidCursorError";
  }
}

export interface CursorPosition {
  sort: VideoSort;
  /** Only for sort "best": the clock-independent score key at this position. */
  bestKey?: number;
  /** publishedAt as milliseconds since the epoch, so offsets like +00:00 and Z compare equal. */
  publishedMs: number;
  youtubeId: string;
}

/** Newest first, then YouTube id ascending. */
export function compareVideos(a: Pick<Video, "publishedAt" | "youtubeId">, b: Pick<Video, "publishedAt" | "youtubeId">): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.youtubeId < b.youtubeId ? -1 : a.youtubeId > b.youtubeId ? 1 : 0);
}

const base64url = (text: string) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (text: string) => atob(text.replace(/-/g, "+").replace(/_/g, "/"));

/** Every video is from the YouTube era, so a cursor outside these dates was not issued by this API. Postgres cannot read timestamps far outside them. */
const MIN_CURSOR_MS = 0;
const MAX_CURSOR_MS = 4_102_444_800_000; // 2100-01-01
/** A best-first key is a small weight plus a day count, far below this. */
const MAX_CURSOR_KEY = 1_000_000;

const SORT_TAG = { latest: "l", oldest: "o", best: "b" } as const;

/** Fields are separated by "~", which cannot appear in a number or in a YouTube id (letters, digits, - and _). */
export function encodeCursor(video: Video, sort: VideoSort = "latest"): string {
  const position = `${Date.parse(video.publishedAt)}~${video.youtubeId}`;
  // The key is written in JavaScript's shortest round-trip form, so Postgres reads back the identical double.
  return base64url(sort === "best" ? `b~${bestKey(video)}~${position}` : `${SORT_TAG[sort]}~${position}`);
}

/** Throws InvalidCursorError for anything this API did not issue, or for a cursor from a different sort. */
export function decodeCursor(cursor: string, sort: VideoSort = "latest"): CursorPosition {
  try {
    const [tag, ...fields] = fromBase64url(cursor).split("~");
    if (tag !== SORT_TAG[sort] || fields.length !== (sort === "best" ? 3 : 2)) throw new InvalidCursorError();
    const bestKeyValue = sort === "best" ? Number(fields.shift()) : undefined;
    const [ms, youtubeId] = fields;
    const publishedMs = Number(ms);
    const keyInRange = bestKeyValue === undefined || (Number.isFinite(bestKeyValue) && Math.abs(bestKeyValue) <= MAX_CURSOR_KEY);
    const timeInRange = Number.isSafeInteger(publishedMs) && publishedMs >= MIN_CURSOR_MS && publishedMs <= MAX_CURSOR_MS;
    if (!keyInRange || !timeInRange || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId ?? "")) throw new InvalidCursorError();
    return { sort, publishedMs, youtubeId: youtubeId!, ...(bestKeyValue !== undefined ? { bestKey: bestKeyValue } : {}) };
  } catch {
    throw new InvalidCursorError();
  }
}

/** True when the video comes after the cursor position in the cursor's own order. */
export function isAfter(video: Pick<Video, "publishedAt" | "youtubeId">, position: CursorPosition): boolean {
  const ms = Date.parse(video.publishedAt);
  if (position.sort === "best") {
    const key = bestKey(video as Video);
    return key < position.bestKey! || (key === position.bestKey && (ms < position.publishedMs || (ms === position.publishedMs && video.youtubeId > position.youtubeId)));
  }
  if (position.sort === "oldest") return ms > position.publishedMs || (ms === position.publishedMs && video.youtubeId < position.youtubeId);
  return ms < position.publishedMs || (ms === position.publishedMs && video.youtubeId > position.youtubeId);
}
