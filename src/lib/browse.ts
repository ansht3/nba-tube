import { CONTENT_TYPE_LABELS, SECTIONS, isContentType, sectionOf, type ContentType, type SectionId } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";
import { getTeam, teamFullName } from "@/catalog/teams";

export const DURATION_BUCKETS = [
  { id: "short", label: "Under 5 minutes", min: 0, max: 5 * 60 },
  { id: "medium", label: "5 to 20 minutes", min: 5 * 60, max: 20 * 60 },
  { id: "long", label: "Over 20 minutes", min: 20 * 60, max: Infinity },
] as const;

export type DurationBucket = (typeof DURATION_BUCKETS)[number]["id"];

export interface BrowseFilters {
  query: string;
  section: SectionId | "";
  type: ContentType | "";
  team: string;
  /** Channel id of the publishing source. */
  source: string;
  duration: DurationBucket | "";
  sort: "newest" | "oldest";
}

export const NO_FILTERS: BrowseFilters = {
  query: "",
  section: "",
  type: "",
  team: "",
  source: "",
  duration: "",
  sort: "newest",
};

/** Reads filters from a URL. Unknown values are ignored, so a stale or hand-edited link still loads. */
export function parseFilters(params: URLSearchParams): BrowseFilters {
  const section = params.get("section") ?? "";
  const type = params.get("type") ?? "";
  const team = (params.get("team") ?? "").toUpperCase();
  const duration = params.get("duration") ?? "";

  return {
    query: (params.get("q") ?? "").trim().slice(0, 100),
    section: SECTIONS.some((candidate) => candidate.id === section) ? (section as SectionId) : "",
    type: isContentType(type) ? type : "",
    team: getTeam(team) ? team : "",
    source: /^UC[\w-]{22}$/.test(params.get("source") ?? "") ? params.get("source")! : "",
    duration: DURATION_BUCKETS.some((bucket) => bucket.id === duration) ? (duration as DurationBucket) : "",
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
  };
}

/** The shortest query string for a set of filters. Defaults are left out to keep links clean. */
export function filtersToQuery(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.section) params.set("section", filters.section);
  if (filters.type) params.set("type", filters.type);
  if (filters.team) params.set("team", filters.team);
  if (filters.source) params.set("source", filters.source);
  if (filters.duration) params.set("duration", filters.duration);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export function hasActiveFilters(filters: BrowseFilters): boolean {
  return filtersToQuery({ ...filters, sort: "newest" }) !== "";
}

/** Lower case, with accents removed, so "jokic" finds "Jokić". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface SearchableVideo {
  video: Video;
  /** Everything a search can match, normalised once up front. */
  text: string;
}

/**
 * Prepares the catalog for searching. Building the search text once per
 * catalog keeps each keystroke to a plain substring scan.
 */
export function buildSearchIndex(videos: Video[]): SearchableVideo[] {
  return videos.map((video) => {
    const teams = video.labels.teamIds.map((id) => {
      const team = getTeam(id);
      return team ? `${teamFullName(team)} ${team.id}` : id;
    });
    const parts = [video.title, video.channelTitle, CONTENT_TYPE_LABELS[video.labels.contentType], ...teams];
    return { video, text: normalize(parts.join(" ")) };
  });
}

function inDurationBucket(video: Video, bucketId: DurationBucket): boolean {
  if (video.durationSeconds === null) return false;
  const bucket = DURATION_BUCKETS.find((candidate) => candidate.id === bucketId)!;
  return video.durationSeconds >= bucket.min && video.durationSeconds < bucket.max;
}

/** Applies every filter. A search must match all of its words, in any order. */
export function filterVideos(index: SearchableVideo[], filters: BrowseFilters): Video[] {
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);

  const matches = index
    .filter(({ video, text }) => {
      if (filters.section && sectionOf(video.labels) !== filters.section) return false;
      if (filters.type && video.labels.contentType !== filters.type) return false;
      if (filters.team && !video.labels.teamIds.includes(filters.team)) return false;
      if (filters.source && video.channelId !== filters.source) return false;
      if (filters.duration && !inDurationBucket(video, filters.duration)) return false;
      return words.every((word) => text.includes(word));
    })
    .map((entry) => entry.video);

  // The catalog arrives newest first, so the other order is just the reverse.
  return filters.sort === "oldest" ? matches.reverse() : matches;
}
