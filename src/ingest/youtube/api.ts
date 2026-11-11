import { YOUTUBE_ID_PATTERN } from "@/catalog/schema";
import { defaultThumbnailUrl, type CandidateVideo } from "../candidate";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** Both list endpoints accept at most 50 ids or items per call. */
const PAGE_SIZE = 50;

export type YouTubeApiErrorKind = "invalid-key" | "quota-exceeded" | "forbidden" | "not-found" | "http" | "bad-response";

export class YouTubeApiError extends Error {
  constructor(
    public readonly kind: YouTubeApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
    details?: { reason?: string }[];
  };
}

function errorReasons(body: ApiErrorBody): string[] {
  const reasons = [...(body.error?.errors ?? []), ...(body.error?.details ?? [])];
  return reasons.map((entry) => entry.reason ?? "");
}

const QUOTA_REASONS = ["quotaExceeded", "dailyLimitExceeded"];
const RATE_LIMIT_REASONS = ["rateLimitExceeded", "userRateLimitExceeded"];

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {};
  }
}

function toApiError(status: number, body: ApiErrorBody): YouTubeApiError {
  const reasons = errorReasons(body);
  const message = body.error?.message ?? `HTTP ${status}`;

  if (reasons.includes("keyInvalid") || reasons.includes("API_KEY_INVALID") || /API key not valid/i.test(message)) {
    return new YouTubeApiError("invalid-key", "YouTube rejected the API key. Check YOUTUBE_API_KEY.", status);
  }
  if (reasons.some((reason) => QUOTA_REASONS.includes(reason))) {
    return new YouTubeApiError("quota-exceeded", "The YouTube API daily quota is used up. It resets at midnight Pacific Time.", status);
  }
  if (status === 403) return new YouTubeApiError("forbidden", `YouTube refused the request: ${message}`, status);
  if (status === 404) return new YouTubeApiError("not-found", message, status);
  return new YouTubeApiError("http", `YouTube API request failed: ${message}`, status);
}

/** A short burst limit is worth waiting out. A spent daily quota is not. */
async function isRateLimited(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const reasons = errorReasons(await readErrorBody(response.clone()));
  return reasons.some((reason) => RATE_LIMIT_REASONS.includes(reason));
}

/** Converts an ISO 8601 duration such as "PT1H2M3S" to seconds. Returns null for anything else. */
export function parseDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const total = days * 86_400 + hours * 3600 + minutes * 60 + seconds;
  // Live streams that have not ended report "P0D".
  return total > 0 ? total : null;
}

interface VideoResource {
  id?: unknown;
  snippet?: {
    title?: unknown;
    channelId?: unknown;
    channelTitle?: unknown;
    publishedAt?: unknown;
    liveBroadcastContent?: unknown;
    thumbnails?: { high?: { url?: unknown } };
  };
  contentDetails?: { duration?: unknown };
  status?: { privacyStatus?: unknown; embeddable?: unknown; uploadStatus?: unknown };
  player?: { embedWidth?: unknown; embedHeight?: unknown };
}

function oneOf<Value extends string>(value: unknown, allowed: readonly Value[]): Value | null {
  return allowed.includes(value as Value) ? (value as Value) : null;
}

/**
 * Turns one API video resource into a candidate. Returns null when a field the
 * catalog cannot do without is missing: a partial response is skipped, never
 * patched up with guesses.
 */
export function toCandidate(resource: VideoResource): CandidateVideo | null {
  const { id, snippet, contentDetails, status, player } = resource;
  if (typeof id !== "string" || !YOUTUBE_ID_PATTERN.test(id)) return null;
  if (!snippet) return null;

  const { title, channelId, channelTitle, publishedAt } = snippet;
  if (typeof title !== "string" || title.trim() === "") return null;
  if (typeof channelId !== "string" || typeof channelTitle !== "string") return null;
  if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) return null;

  // A video that is still processing has no playable stream yet. It is picked up by a later sync.
  if (status?.uploadStatus !== undefined && status.uploadStatus !== "processed") return null;

  const thumbnail = snippet.thumbnails?.high?.url;
  const width = Number(player?.embedWidth);
  const height = Number(player?.embedHeight);

  return {
    youtubeId: id,
    title,
    channelId,
    channelTitle,
    thumbnailUrl: typeof thumbnail === "string" ? thumbnail : defaultThumbnailUrl(id),
    publishedAt,
    durationSeconds: parseDuration(contentDetails?.duration),
    embeddable: typeof status?.embeddable === "boolean" ? status.embeddable : null,
    privacyStatus: oneOf(status?.privacyStatus, ["public", "unlisted", "private"] as const),
    liveBroadcast: oneOf(snippet.liveBroadcastContent, ["none", "live", "upcoming"] as const),
    isVertical: width > 0 && height > 0 ? height > width : null,
    discoveryMethod: "data-api",
  };
}

export interface ChannelInfo {
  title: string;
  uploadsPlaylistId: string;
}

export interface YouTubeApi {
  /** Looks up the uploads playlist of each channel. Channels YouTube does not return are absent from the map. */
  getChannels(channelIds: string[]): Promise<Map<string, ChannelInfo>>;
  /** The newest video ids in a playlist, newest first, up to `limit`. */
  listPlaylistVideoIds(playlistId: string, limit: number): Promise<string[]>;
  /** Full details for the given ids. Deleted and private videos are simply missing from the result. */
  getVideos(youtubeIds: string[]): Promise<CandidateVideo[]>;
  /** Quota units spent so far. Every call used here costs one unit. */
  readonly unitsUsed: number;
}

export interface YouTubeApiOptions {
  apiKey: string;
  fetch: FetchLike;
  retry?: RetryOptions;
}

export function createYouTubeApi(options: YouTubeApiOptions): YouTubeApi {
  let unitsUsed = 0;

  async function get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({ ...params, key: options.apiKey });
    unitsUsed += 1;
    // The URL carries the key, so it must never appear in an error or a log line.
    const response = await fetchWithRetry(options.fetch, `${API_BASE}/${path}?${query}`, {
      ...options.retry,
      isRetryable: isRateLimited,
    });

    if (!response.ok) throw toApiError(response.status, await readErrorBody(response));

    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new YouTubeApiError("bad-response", `YouTube returned a response that is not JSON for ${path}`);
    }
  }

  function itemsOf(body: Record<string, unknown>): Record<string, unknown>[] {
    return Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  }

  return {
    get unitsUsed() {
      return unitsUsed;
    },

    async getChannels(channelIds) {
      const channels = new Map<string, ChannelInfo>();
      for (let start = 0; start < channelIds.length; start += PAGE_SIZE) {
        const body = await get("channels", {
          part: "snippet,contentDetails",
          id: channelIds.slice(start, start + PAGE_SIZE).join(","),
          maxResults: String(PAGE_SIZE),
        });
        for (const item of itemsOf(body)) {
          const snippet = item.snippet as { title?: unknown } | undefined;
          const details = item.contentDetails as { relatedPlaylists?: { uploads?: unknown } } | undefined;
          const uploads = details?.relatedPlaylists?.uploads;
          if (typeof item.id === "string" && typeof uploads === "string" && typeof snippet?.title === "string") {
            channels.set(item.id, { title: snippet.title, uploadsPlaylistId: uploads });
          }
        }
      }
      return channels;
    },

    async listPlaylistVideoIds(playlistId, limit) {
      const ids: string[] = [];
      let pageToken: string | undefined;

      while (ids.length < limit) {
        const params: Record<string, string> = {
          part: "contentDetails",
          playlistId,
          maxResults: String(Math.min(PAGE_SIZE, limit - ids.length)),
        };
        if (pageToken) params.pageToken = pageToken;

        const body = await get("playlistItems", params);
        for (const item of itemsOf(body)) {
          const videoId = (item.contentDetails as { videoId?: unknown } | undefined)?.videoId;
          if (typeof videoId === "string" && YOUTUBE_ID_PATTERN.test(videoId)) ids.push(videoId);
        }

        if (typeof body.nextPageToken !== "string") break;
        pageToken = body.nextPageToken;
      }

      return ids.slice(0, limit);
    },

    async getVideos(youtubeIds) {
      const videos: CandidateVideo[] = [];
      for (let start = 0; start < youtubeIds.length; start += PAGE_SIZE) {
        const body = await get("videos", {
          part: "snippet,contentDetails,status,player",
          id: youtubeIds.slice(start, start + PAGE_SIZE).join(","),
          // Asking for a width makes the API report the embed's shape, which is
          // the only documented way to tell a vertical video from a landscape one.
          maxWidth: "640",
        });
        for (const item of itemsOf(body)) {
          const candidate = toCandidate(item as VideoResource);
          if (candidate) videos.push(candidate);
        }
      }
      return videos;
    },
  };
}
