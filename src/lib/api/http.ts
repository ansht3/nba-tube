/**
 * Cache policy for the public read API. Responses are the same for everyone,
 * so a shared cache (the CDN) may keep them: fresh for `s-maxage`, then served
 * while a new copy is fetched in the background for `stale-while-revalidate`.
 * Catalog versions change at most every few minutes, so a short freshness
 * window keeps the database out of the hot path without hiding new videos long.
 */
export const LIST_CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";
export const VIDEO_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
export const NO_STORE = "no-store";

/** FNV-1a, 32 bit. Enough to tell two payloads apart for an ETag; not a security hash. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const weakEtag = (...parts: string[]): string => `W/"${parts.join("-")}"`;

/** True when If-None-Match names this ETag. Weak comparison, as HTTP specifies for conditional GETs. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const strip = (value: string) => value.trim().replace(/^W\//, "");
  return header.split(",").some((candidate) => candidate.trim() === "*" || strip(candidate) === strip(etag));
}

export function json(body: unknown, init: { status?: number; etag?: string; cache: string }): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": init.cache });
  if (init.etag) headers.set("ETag", init.etag);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function notModified(etag: string, cache: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
}

/** Errors are never cached: a bad request or an outage must not stick at the CDN. */
export function errorResponse(status: number, message: string): Response {
  return json({ error: message }, { status, cache: NO_STORE });
}
