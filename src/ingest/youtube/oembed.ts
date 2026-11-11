import { fetchWithRetry, NetworkError, type FetchLike, type RetryOptions } from "../http";

export type EmbedCheck =
  | { status: "ok"; title: string; channelTitle: string }
  /** YouTube says the video is gone, private or not allowed in embedded players. */
  | { status: "unavailable" }
  /** The check itself failed. Nothing was learned, so nothing should be removed. */
  | { status: "unknown" };

/**
 * Asks YouTube's oEmbed endpoint whether a video can be embedded. It needs no
 * API key, which makes it the availability check for the keyless feed mode.
 * Observed responses: 200 for a public embeddable video, 404 for a missing id,
 * 401 or 403 when embedding is disabled or the video is private.
 */
export async function checkEmbed(youtubeId: string, fetchImpl: FetchLike, retry?: RetryOptions): Promise<EmbedCheck> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;

  let response: Response;
  try {
    response = await fetchWithRetry(fetchImpl, url, retry);
  } catch (error) {
    if (error instanceof NetworkError) return { status: "unknown" };
    throw error;
  }

  if ([400, 401, 403, 404].includes(response.status)) return { status: "unavailable" };
  if (!response.ok) return { status: "unknown" };

  try {
    const body = (await response.json()) as { title?: unknown; author_name?: unknown };
    if (typeof body.title !== "string" || typeof body.author_name !== "string") return { status: "unknown" };
    return { status: "ok", title: body.title, channelTitle: body.author_name };
  } catch {
    return { status: "unknown" };
  }
}
