import { sectionOf } from "@/catalog/content-types";
import {
  decodeCursor,
  encodeCursor,
  type CatalogMeta,
  type CatalogRepository,
  type ChannelSummary,
  type VideoFilter,
  type VideoPage,
  type VideoQuery,
} from "@/catalog/repository";
import { videoSchema, type Video } from "@/catalog/schema";
import { searchWords } from "@/catalog/search";
import { SAME_GAME_BONUS, SAME_GAME_WINDOW_MS } from "@/catalog/select";
import type { IngestionHealth } from "@/lib/api/health";
import type { Db } from "./db";

/** Collects query values and hands back their $n placeholders. */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
  /** A list passed as one JSON parameter and read back as a text[] value. */
  textArray(values: string[]): string {
    return `ARRAY(SELECT jsonb_array_elements_text(${this.add(JSON.stringify(values))}::jsonb))`;
  }
  /** A list passed as one JSON parameter and read back as rows of text. */
  textList(values: string[]): string {
    return `(SELECT jsonb_array_elements_text(${this.add(JSON.stringify(values))}::jsonb))`;
  }
}

function filterClauses(filter: VideoFilter, params: Params): string[] {
  const clauses: string[] = [];
  if (filter.section) clauses.push(`section = ${params.add(filter.section)}`);
  if (filter.teamId) clauses.push(`team_ids @> ARRAY[${params.add(filter.teamId)}]::text[]`);
  if (filter.anyTeamIds) clauses.push(`team_ids && ${params.textArray(filter.anyTeamIds)}`);
  if (filter.contentTypes) clauses.push(`content_type IN ${params.textList(filter.contentTypes)}`);
  if (filter.channelId) clauses.push(`channel_id = ${params.add(filter.channelId)}`);
  if (filter.ids) clauses.push(`youtube_id IN ${params.textList(filter.ids)}`);
  if (filter.publishedAfterMs !== undefined) clauses.push(`published_at >= to_timestamp(${params.add(filter.publishedAfterMs)}::double precision / 1000.0)`);
  if (filter.duration) {
    clauses.push(`(data->>'durationSeconds') IS NOT NULL AND (data->>'durationSeconds')::int >= ${params.add(filter.duration.min)}`);
    if (filter.duration.max !== null) clauses.push(`(data->>'durationSeconds')::int < ${params.add(filter.duration.max)}`);
  }
  // strpos is an exact substring test, so a search needs no LIKE escaping.
  for (const word of searchWords(filter.q ?? "")) clauses.push(`strpos(search_text, ${params.add(word)}) > 0`);
  return clauses;
}

const where = (clauses: string[]) => (clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "");
/**
 * Reads stored videos. A row whose data no longer matches the schema (written by an older version, or damaged) is left
 * out and logged by id, instead of throwing: one bad row must not take down every page it would have appeared on.
 */
function parse(rows: { data: unknown }[]): Video[] {
  const videos: Video[] = [];
  for (const row of rows) {
    const parsed = videoSchema.safeParse(row.data);
    if (parsed.success) videos.push(parsed.data);
    else console.error(`Skipping a stored video that does not match the schema: ${describeRow(row.data)}`);
  }
  return videos;
}

const describeRow = (data: unknown) => (typeof data === "object" && data !== null && typeof (data as { youtubeId?: unknown }).youtubeId === "string" ? (data as { youtubeId: string }).youtubeId : "(no id)");

/**
 * The catalog answered by indexed queries instead of an in-memory array. Order
 * is "published_at DESC, youtube_id ASC" (ids in byte order), the same as
 * compareVideos, so a keyset cursor stays valid while newer videos arrive.
 */
export class PostgresCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Db) {}

  async meta(): Promise<CatalogMeta> {
    const [row] = await this.db.query<{ version: string | number; published_at: string; mode: CatalogMeta["mode"]; video_count: number; newest_published_at: string | null; newest_id: string | null }>(
      `SELECT version, published_at, mode, video_count, newest_published_at,
              (SELECT youtube_id FROM videos ORDER BY published_at DESC, youtube_id LIMIT 1) AS newest_id
       FROM catalog_versions ORDER BY version DESC LIMIT 1`,
    );
    if (!row) return { version: "0", generatedAt: new Date(0).toISOString(), mode: "feed", total: 0, newestPublishedAt: null, newestId: null };
    return {
      version: String(row.version),
      generatedAt: new Date(row.published_at).toISOString(),
      mode: row.mode,
      total: Number(row.video_count),
      newestPublishedAt: row.newest_published_at ? new Date(row.newest_published_at).toISOString() : null,
      newestId: row.newest_id,
    };
  }

  async list(query: VideoQuery): Promise<VideoPage> {
    const sort = query.sort ?? "latest";
    const countParams = new Params();
    const countClauses = filterClauses(query, countParams);

    const params = new Params();
    const clauses = filterClauses(query, params);
    if (query.cursor) {
      const position = decodeCursor(query.cursor, sort);
      const ts = `to_timestamp(${params.add(position.publishedMs)}::double precision / 1000.0)`;
      const id = params.add(position.youtubeId);
      const newestAfter = `(published_at < ${ts} OR (published_at = ${ts} AND youtube_id > ${id}))`;
      if (sort === "latest") clauses.push(newestAfter);
      else if (sort === "oldest") clauses.push(`(published_at > ${ts} OR (published_at = ${ts} AND youtube_id < ${id}))`);
      else {
        const key = params.add(position.bestKey);
        clauses.push(`(best_key < ${key}::double precision OR (best_key = ${key}::double precision AND ${newestAfter}))`);
      }
    }
    const order = { latest: "published_at DESC, youtube_id ASC", oldest: "published_at ASC, youtube_id DESC", best: "best_key DESC, published_at DESC, youtube_id ASC" }[sort];
    // One extra row tells whether another page exists without a second query.
    const [total, rows] = await Promise.all([
      this.db.query<{ n: string }>(`SELECT count(*) AS n FROM videos ${where(countClauses)}`, countParams.values),
      this.db.query<{ data: unknown }>(`SELECT data FROM videos ${where(clauses)} ORDER BY ${order} LIMIT ${params.add(query.limit + 1)}`, params.values),
    ]);
    const videos = parse(rows.slice(0, query.limit));
    const last = videos.at(-1);
    return { videos, total: Number(total[0]!.n), nextCursor: last && rows.length > query.limit ? encodeCursor(last, sort) : null };
  }

  async count(filter: VideoFilter): Promise<number> {
    const params = new Params();
    const [row] = await this.db.query<{ n: string }>(`SELECT count(*) AS n FROM videos ${where(filterClauses(filter, params))}`, params.values);
    return Number(row!.n);
  }

  async get(youtubeId: string): Promise<Video | null> {
    const rows = await this.db.query<{ data: unknown }>(`SELECT data FROM videos WHERE youtube_id = $1`, [youtubeId]);
    return parse(rows)[0] ?? null;
  }

  async related(video: Video, limit: number): Promise<Video[]> {
    const params = new Params();
    const teams = params.textList(video.labels.teamIds);
    // The same scoring as relatedVideos: 3 per shared team, +2 for the same team in the same game window, 2 for the same type, 1 for the same section, 1 for the same channel.
    const rows = await this.db.query<{ data: unknown }>(
      `SELECT data FROM (
         SELECT data, published_at, youtube_id,
                3 * shared.n
                + CASE WHEN shared.n > 0 AND abs(extract(epoch FROM published_at) * 1000 - ${params.add(Date.parse(video.publishedAt))}::double precision) <= ${SAME_GAME_WINDOW_MS} THEN ${SAME_GAME_BONUS} ELSE 0 END
                + CASE WHEN content_type = ${params.add(video.labels.contentType)} THEN 2 ELSE 0 END
                + CASE WHEN section = ${params.add(sectionOf(video.labels))} THEN 1 ELSE 0 END
                + CASE WHEN channel_id = ${params.add(video.channelId)} THEN 1 ELSE 0 END AS score
         FROM videos CROSS JOIN LATERAL (SELECT count(*) AS n FROM unnest(team_ids) AS t WHERE t IN ${teams}) AS shared
         WHERE youtube_id <> ${params.add(video.youtubeId)}
       ) scored
       WHERE score > 0
       ORDER BY score DESC, published_at DESC, youtube_id ASC
       LIMIT ${params.add(limit)}`,
      params.values,
    );
    return parse(rows);
  }

  async countsByTeam(): Promise<Map<string, number>> {
    const rows = await this.db.query<{ team: string; n: string }>(`SELECT t AS team, count(*) AS n FROM videos, unnest(team_ids) AS t GROUP BY t ORDER BY t`);
    return new Map(rows.map((row) => [row.team, Number(row.n)]));
  }

  async channels(): Promise<ChannelSummary[]> {
    // The newest video's channel title is the channel's current name.
    const rows = await this.db.query<{ channel_id: string; title: string; n: string }>(
      `SELECT channel_id, (array_agg(data->>'channelTitle' ORDER BY published_at DESC, youtube_id))[1] AS title, count(*) AS n FROM videos GROUP BY channel_id`,
    );
    return rows.map((row) => ({ channelId: row.channel_id, channelTitle: row.title, count: Number(row.n) }));
  }

  async allIds(): Promise<string[]> {
    return (await this.db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos ORDER BY published_at DESC, youtube_id`)).map((row) => row.youtube_id);
  }

  /** What the worker and the per-channel checkpoints say about ingestion, for /api/health. */
  async ingestionHealth(): Promise<IngestionHealth> {
    const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);
    const [last] = await this.db.query<{ status: string; started_at: string }>(`SELECT status, started_at FROM ingestion_runs ORDER BY run_id DESC LIMIT 1`);
    const [success] = await this.db.query<{ at: string | null }>(`SELECT max(finished_at) AS at FROM ingestion_runs WHERE status IN ('succeeded', 'partial')`);
    const [sources] = await this.db.query<{ tracked: string; failing: string; oldest: string | null }>(
      `SELECT count(*) AS tracked, count(*) FILTER (WHERE consecutive_failures >= 3) AS failing, min(last_success_at) AS oldest FROM source_checkpoints`,
    );
    return {
      lastRunAt: last ? iso(last.started_at) : null,
      lastRunStatus: last?.status ?? null,
      lastSuccessAt: iso(success?.at ?? null),
      channelsTracked: Number(sources?.tracked ?? 0),
      channelsFailing: Number(sources?.failing ?? 0),
      oldestSourceSuccessAt: iso(sources?.oldest ?? null),
    };
  }
}
