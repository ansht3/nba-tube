import { SECTIONS, isContentType, type ContentType, type SectionId } from "./content-types";
import type { VideoQuery } from "./repository";
import { searchWords } from "./search";
import { getTeam } from "./teams";

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
const MAX_QUERY_CHARS = 80;
const MAX_CURSOR_CHARS = 120;
const MAX_TEAMS = 30;

export const UPLOAD_WINDOW_DAYS = { day: 1, week: 7, month: 30 } as const;
/** Seconds, min inclusive and max exclusive. Matches the duration chips on the browse page. */
export const DURATION_RANGES = {
  short: { min: 0, max: 5 * 60 },
  medium: { min: 5 * 60, max: 20 * 60 },
  long: { min: 20 * 60, max: null },
} as const;

const PARAMS = ["section", "team", "teams", "type", "channel", "ids", "q", "date", "duration", "sort", "limit", "cursor"] as const;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const MINUTE_MS = 60_000;

export type ParsedVideoQuery =
  | {
      ok: true;
      query: VideoQuery;
      /** The same query always gives the same key, whatever order the parameters came in. Used for ETags. */
      cacheKey: string;
      /** True when the result depends on the clock (an upload window), so a cached answer ages even if the catalog does not. */
      timeSensitive: boolean;
    }
  | { ok: false; error: string };

const fail = (error: string): ParsedVideoQuery => ({ ok: false, error });

/**
 * Validates the query string of /api/videos. It is strict on purpose: an
 * unknown parameter is an error, not ignored, because a CDN keys on the whole
 * URL and ignored parameters would let anyone create unlimited cache entries.
 */
export function parseVideoQuery(params: URLSearchParams, now: number): ParsedVideoQuery {
  for (const name of new Set(params.keys())) if (!(PARAMS as readonly string[]).includes(name)) return fail(`Unknown parameter "${name}".`);
  for (const name of PARAMS) if (params.getAll(name).length > 1) return fail(`Parameter "${name}" may only be given once.`);

  const query: VideoQuery = { limit: DEFAULT_PAGE_SIZE };

  const section = params.get("section");
  if (section) {
    if (!SECTIONS.some((candidate) => candidate.id === section)) return fail(`Unknown section "${section}".`);
    query.section = section as SectionId;
  }

  const team = params.get("team");
  if (team) {
    const found = getTeam(team.toUpperCase());
    if (!found) return fail(`Unknown team "${team}".`);
    query.teamId = found.id;
  }

  const teams = params.get("teams");
  if (teams) {
    const found = [...new Set(teams.split(",").map((code) => code.toUpperCase()))];
    if (found.length > MAX_TEAMS) return fail(`teams may name at most ${MAX_TEAMS} teams.`);
    const bad = found.find((code) => !getTeam(code));
    if (bad !== undefined) return fail(`Unknown team "${bad}".`);
    query.anyTeamIds = found;
  }

  const type = params.get("type");
  if (type) {
    const types = [...new Set(type.split(","))];
    const bad = types.find((candidate) => !isContentType(candidate));
    if (bad !== undefined) return fail(`Unknown content type "${bad}".`);
    query.contentTypes = types as ContentType[];
  }

  const channel = params.get("channel");
  if (channel) {
    if (!CHANNEL_ID.test(channel)) return fail("channel must be a YouTube channel id.");
    query.channelId = channel;
  }

  const ids = params.get("ids");
  if (ids) {
    const list = [...new Set(ids.split(","))];
    if (list.length > MAX_PAGE_SIZE) return fail(`ids may name at most ${MAX_PAGE_SIZE} videos.`);
    const bad = list.find((id) => !YOUTUBE_ID.test(id));
    if (bad !== undefined) return fail(`"${bad}" is not a YouTube video id.`);
    query.ids = list;
  }

  const q = params.get("q")?.replace(/\s+/g, " ").trim();
  if (q) {
    if (q.length > MAX_QUERY_CHARS) return fail(`q may be at most ${MAX_QUERY_CHARS} characters.`);
    query.q = q;
  }

  let timeSensitive = false;
  const date = params.get("date");
  if (date) {
    if (!(date in UPLOAD_WINDOW_DAYS)) return fail(`Unknown date window "${date}".`);
    // Rounded to the minute so a window's answer is the same for a whole minute and can be cached.
    query.publishedAfterMs = Math.floor(now / MINUTE_MS) * MINUTE_MS - UPLOAD_WINDOW_DAYS[date as keyof typeof UPLOAD_WINDOW_DAYS] * 86_400_000;
    timeSensitive = true;
  }

  const duration = params.get("duration");
  if (duration) {
    if (!(duration in DURATION_RANGES)) return fail(`Unknown duration "${duration}".`);
    query.duration = { ...DURATION_RANGES[duration as keyof typeof DURATION_RANGES] };
  }

  const sort = params.get("sort");
  if (sort) {
    if (sort !== "latest" && sort !== "oldest" && sort !== "best") return fail(`Unknown sort "${sort}".`);
    query.sort = sort;
  }

  const limit = params.get("limit");
  if (limit !== null) {
    const value = Number(limit);
    if (!/^\d+$/.test(limit) || value < 1 || value > MAX_PAGE_SIZE) return fail(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
    query.limit = value;
  }

  const cursor = params.get("cursor");
  if (cursor) {
    if (cursor.length > MAX_CURSOR_CHARS) return fail("cursor is too long.");
    query.cursor = cursor;
  }

  // Built from what the query means, not from how it was written, so "team=lal" and "team=LAL", reordered lists and
  // an explicit default all share one cache entry, and one ETag.
  const set = (values: readonly string[] | undefined) => [...new Set(values ?? [])].sort().join(",");
  const cacheKey = [
    `section=${query.section ?? ""}`,
    `team=${query.teamId ?? ""}`,
    `teams=${set(query.anyTeamIds)}`,
    `type=${set(query.contentTypes)}`,
    `channel=${query.channelId ?? ""}`,
    `ids=${set(query.ids)}`,
    `q=${set(searchWords(query.q ?? ""))}`,
    `date=${params.get("date") ?? ""}`,
    `duration=${params.get("duration") ?? ""}`,
    `sort=${query.sort ?? "latest"}`,
    `limit=${query.limit}`,
    `cursor=${query.cursor ?? ""}`,
  ].join("&");
  return { ok: true, query, cacheKey, timeSensitive };
}
