import { parseVideoQuery } from "@/catalog/query";
import { InvalidCursorError, type CatalogRepository } from "@/catalog/repository";
import { errorResponse, etagMatches, hash, json, LIST_CACHE, notModified, VIDEO_CACHE, weakEtag } from "./http";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const MINUTE_MS = 60_000;

/**
 * GET /api/videos. The repository is passed in so the same code runs against
 * the file catalog, Postgres, or a test double.
 */
export async function handleListVideos(request: Request, repository: CatalogRepository, now: number = Date.now()): Promise<Response> {
  const parsed = parseVideoQuery(new URL(request.url).searchParams, now);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  try {
    const meta = await repository.meta();
    // The answer only changes when the catalog version does (or, for an upload window, when the minute does),
    // so the ETag can be known before running the list query. A matching ETag costs one tiny query.
    const etag = weakEtag(meta.version, hash(parsed.cacheKey), parsed.timeSensitive ? String(Math.floor(now / MINUTE_MS)) : "");
    if (etagMatches(request.headers.get("if-none-match"), etag)) return notModified(etag, LIST_CACHE);

    const page = await repository.list(parsed.query);
    return json({ videos: page.videos, total: page.total, nextCursor: page.nextCursor, version: meta.version }, { etag, cache: LIST_CACHE });
  } catch (error) {
    if (error instanceof InvalidCursorError) return errorResponse(400, error.message);
    // Details stay in the server log; the client only learns that the catalog is unavailable.
    console.error("GET /api/videos failed:", error instanceof Error ? error.message : error);
    return errorResponse(503, "The catalog is temporarily unavailable.");
  }
}

/** GET /api/videos/:id */
export async function handleGetVideo(request: Request, id: string, repository: CatalogRepository): Promise<Response> {
  if (!YOUTUBE_ID.test(id)) return errorResponse(400, "A YouTube video id has 11 characters: letters, digits, - and _.");
  try {
    const video = await repository.get(id);
    if (!video) return errorResponse(404, "No such video in the catalog.");
    const etag = weakEtag(hash(JSON.stringify(video)));
    if (etagMatches(request.headers.get("if-none-match"), etag)) return notModified(etag, VIDEO_CACHE);
    return json({ video }, { etag, cache: VIDEO_CACHE });
  } catch (error) {
    console.error("GET /api/videos/:id failed:", error instanceof Error ? error.message : error);
    return errorResponse(503, "The catalog is temporarily unavailable.");
  }
}
