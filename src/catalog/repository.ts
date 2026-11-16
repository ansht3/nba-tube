import type { ContentType, SectionId } from "./content-types";
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
  contentTypes?: ContentType[];
  channelId?: string;
}

export interface VideoQuery extends VideoFilter {
  limit: number;
  /** An opaque cursor from a previous page's nextCursor. */
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
}

export interface ChannelSummary {
  channelId: string;
  channelTitle: string;
  count: number;
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

export function encodeCursor(video: Pick<Video, "publishedAt" | "youtubeId">): string {
  return base64url(`${Date.parse(video.publishedAt)}.${video.youtubeId}`);
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const [ms, youtubeId, ...rest] = fromBase64url(cursor).split(".");
    const publishedMs = Number(ms);
    if (rest.length > 0 || !Number.isSafeInteger(publishedMs) || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId ?? "")) throw new InvalidCursorError();
    return { publishedMs, youtubeId: youtubeId! };
  } catch {
    throw new InvalidCursorError();
  }
}

/** True when the video comes after the cursor in catalog order. */
export function isAfter(video: Pick<Video, "publishedAt" | "youtubeId">, position: CursorPosition): boolean {
  const ms = Date.parse(video.publishedAt);
  return ms < position.publishedMs || (ms === position.publishedMs && video.youtubeId > position.youtubeId);
}
