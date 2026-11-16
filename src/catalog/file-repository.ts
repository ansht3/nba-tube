import { bestKey } from "@/lib/rank";
import { sectionOf } from "./content-types";
import { searchTextFor, searchWords } from "./search";
import {
  compareVideos,
  decodeCursor,
  encodeCursor,
  isAfter,
  type CatalogMeta,
  type CatalogRepository,
  type ChannelSummary,
  type VideoFilter,
  type VideoPage,
  type VideoQuery,
} from "./repository";
import type { Catalog, Video } from "./schema";
import { countByTeam, relatedVideos } from "./select";

function matches(video: Video, filter: VideoFilter, words: string[]): boolean {
  if (filter.section && sectionOf(video.labels) !== filter.section) return false;
  if (filter.teamId && !video.labels.teamIds.includes(filter.teamId)) return false;
  if (filter.anyTeamIds && !filter.anyTeamIds.some((id) => video.labels.teamIds.includes(id))) return false;
  if (filter.contentTypes && !filter.contentTypes.includes(video.labels.contentType)) return false;
  if (filter.channelId && video.channelId !== filter.channelId) return false;
  if (filter.ids && !filter.ids.includes(video.youtubeId)) return false;
  if (filter.publishedAfterMs !== undefined && Date.parse(video.publishedAt) < filter.publishedAfterMs) return false;
  if (filter.duration) {
    const seconds = video.durationSeconds;
    if (seconds === null || seconds < filter.duration.min || (filter.duration.max !== null && seconds >= filter.duration.max)) return false;
  }
  if (words.length > 0) {
    const text = searchTextFor(video);
    if (!words.every((word) => text.includes(word))) return false;
  }
  return true;
}

/**
 * The catalog held in memory as one parsed JSON file. This is how the site has
 * always worked, and it stays the fallback when no database is configured.
 * It takes a function so a test can hand it any catalog; the site hands it the
 * loader that reads data/catalog.json.
 */
export class FileCatalogRepository implements CatalogRepository {
  private sortedFor: { catalog: Catalog; videos: Video[] } | null = null;

  constructor(private readonly load: () => Catalog) {}

  private snapshot(): { catalog: Catalog; videos: Video[] } {
    const catalog = this.load();
    // The loader returns the same object until the file changes, so sorting happens once per catalog.
    if (this.sortedFor?.catalog !== catalog) this.sortedFor = { catalog, videos: [...catalog.videos].sort(compareVideos) };
    return this.sortedFor;
  }

  async meta(): Promise<CatalogMeta> {
    const { catalog, videos } = this.snapshot();
    return { version: catalog.generatedAt, generatedAt: catalog.generatedAt, mode: catalog.mode, total: videos.length, newestPublishedAt: videos[0]?.publishedAt ?? null, newestId: videos[0]?.youtubeId ?? null };
  }

  async list(query: VideoQuery): Promise<VideoPage> {
    const sort = query.sort ?? "latest";
    const words = searchWords(query.q ?? "");
    const newestFirst = this.snapshot().videos.filter((video) => matches(video, query, words));
    // "oldest" is the exact reverse of the catalog order, ties included. "best" orders by the clock-independent
    // score key, then newest, then id (newestFirst is already in that tie order and the sort is stable).
    const matching = sort === "oldest" ? [...newestFirst].reverse() : sort === "best" ? [...newestFirst].sort((a, b) => bestKey(b) - bestKey(a)) : newestFirst;
    const position = query.cursor ? decodeCursor(query.cursor, sort) : null;
    const remaining = position ? matching.filter((video) => isAfter(video, position)) : matching;
    const videos = remaining.slice(0, query.limit);
    const last = videos.at(-1);
    return { videos, total: matching.length, nextCursor: last && remaining.length > videos.length ? encodeCursor(last, sort) : null };
  }

  async count(filter: VideoFilter): Promise<number> {
    const words = searchWords(filter.q ?? "");
    return this.snapshot().videos.filter((video) => matches(video, filter, words)).length;
  }

  async get(youtubeId: string): Promise<Video | null> {
    return this.snapshot().videos.find((video) => video.youtubeId === youtubeId) ?? null;
  }

  async related(video: Video, limit: number): Promise<Video[]> {
    return relatedVideos(video, this.snapshot().videos, limit);
  }

  async countsByTeam(): Promise<Map<string, number>> {
    return countByTeam(this.snapshot().videos);
  }

  async channels(): Promise<ChannelSummary[]> {
    const byChannel = new Map<string, ChannelSummary>();
    // Newest first, so the first title seen for a channel is its current name.
    for (const video of this.snapshot().videos) {
      const entry = byChannel.get(video.channelId);
      if (entry) entry.count += 1;
      else byChannel.set(video.channelId, { channelId: video.channelId, channelTitle: video.channelTitle, count: 1 });
    }
    return [...byChannel.values()];
  }

  async allIds(): Promise<string[]> {
    return this.snapshot().videos.map((video) => video.youtubeId);
  }
}
