import { parseVideoQuery } from "@/catalog/query";
import { InvalidCursorError, type CatalogRepository } from "@/catalog/repository";
import type { Video } from "@/catalog/schema";
import { errorResponse, etagMatches, hash, json, notModified, weakEtag } from "./http";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const MINUTE_MS = 60_000;

/** The version answer is tiny and changes only when ingestion publishes, so the CDN may hold it briefly. */
export const VERSION_CACHE = "public, max-age=0, s-maxage=15, stale-while-revalidate=60";

/**
 * GET /api/version: about 100 bytes. Clients poll this instead of downloading
 * the catalog, and only ask for details when the version differs from theirs.
 */
export async function handleVersion(request: Request, repository: CatalogRepository): Promise<Response> {
  try {
    const meta = await repository.meta();
    const etag = weakEtag(meta.version);
    if (etagMatches(request.headers.get("if-none-match"), etag)) return notModified(etag, VERSION_CACHE);
    return json({ version: meta.version, newestId: meta.newestId, newestPublishedAt: meta.newestPublishedAt, total: meta.total }, { etag, cache: VERSION_CACHE });
  } catch (error) {
    console.error("GET /api/version failed:", error instanceof Error ? error.message : error);
    return errorResponse(503, "The catalog is temporarily unavailable.");
  }
}

export interface UpdatesBody {
  /** Videos newer than `since`, newest first. */
  videos: Video[];
  /** How many new videos. When hasMore, this is the page size: there are at least that many. */
  count: number;
  /** More new videos exist than were returned, so a client should reload the feed from the top instead of splicing. */
  hasMore: boolean;
  /** `since` is no longer in the catalog (it aged out or was removed), so a client cannot tell what is new and should reload. */
  reset: boolean;
  version: string;
}

/**
 * GET /api/updates?since=<video id>[&filters]: the videos newer than one the
 * client already has, under the same filters as its feed. It looks for that
 * video inside the newest-first page, so "newer" is exact (no timestamp
 * rounding, ties included) and needs no cursor.
 */
export async function handleUpdates(request: Request, repository: CatalogRepository, now: number = Date.now()): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const since = params.get("since");
  if (!since || !YOUTUBE_ID.test(since)) return errorResponse(400, "since must be the id of a video the client already has.");
  for (const forbidden of ["cursor", "sort"]) if (params.has(forbidden)) return errorResponse(400, `Parameter "${forbidden}" does not apply to updates.`);

  const rest = new URLSearchParams(params);
  rest.delete("since");
  const parsed = parseVideoQuery(rest, now);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  try {
    const meta = await repository.meta();
    const etag = weakEtag(meta.version, hash(`${since}|${parsed.cacheKey}`), parsed.timeSensitive ? String(Math.floor(now / MINUTE_MS)) : "");
    if (etagMatches(request.headers.get("if-none-match"), etag)) return notModified(etag, VERSION_CACHE);

    const known = await repository.get(since);
    if (!known) return json({ videos: [], count: 0, hasMore: false, reset: true, version: meta.version } satisfies UpdatesBody, { etag, cache: VERSION_CACHE });

    // One extra row: if the page has more than `limit` videos before `since`, or never reaches it, more exist than we return.
    const page = await repository.list({ ...parsed.query, limit: parsed.query.limit + 1 });
    const index = page.videos.findIndex((video) => video.youtubeId === since);
    const body: UpdatesBody =
      index >= 0
        ? { videos: page.videos.slice(0, index), count: index, hasMore: false, reset: false, version: meta.version }
        : { videos: page.videos.slice(0, parsed.query.limit), count: parsed.query.limit, hasMore: true, reset: false, version: meta.version };
    return json(body, { etag, cache: VERSION_CACHE });
  } catch (error) {
    if (error instanceof InvalidCursorError) return errorResponse(400, error.message);
    console.error("GET /api/updates failed:", error instanceof Error ? error.message : error);
    return errorResponse(503, "The catalog is temporarily unavailable.");
  }
}
