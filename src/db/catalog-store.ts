import { sectionOf } from "@/catalog/content-types";
import { searchTextFor } from "@/catalog/search";
import { bestKey } from "@/catalog/rank";
import { catalogSchema, videoSchema, type Catalog, type Video } from "@/catalog/schema";
import type { Db, Statement } from "./db";

const CHUNK_SIZE = 200;

export interface WriteResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface PublishResult extends WriteResult {
  /** Videos removed by this call (confirmed gone upstream). */
  removed: number;
  /** The catalog version after these writes: a new one if anything changed, otherwise the unchanged current one (0 when none exists yet). */
  version: number;
  published: boolean;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const UPSERT_CHANNELS = `
  INSERT INTO channels (channel_id, title, publisher_type)
  SELECT DISTINCT ON (v->>'channelId') v->>'channelId', v->>'channelTitle', v->'provenance'->>'publisherType'
  FROM jsonb_array_elements($1::jsonb) AS e(v)
  ORDER BY v->>'channelId'
  ON CONFLICT (channel_id) DO UPDATE SET title = EXCLUDED.title, updated_at = now()
  WHERE channels.title IS DISTINCT FROM EXCLUDED.title`;

// Rows whose record did not change are not touched, so re-running an import or an ingestion is free and counts stay honest.
const UPSERT_VIDEOS = `
  INSERT INTO videos (youtube_id, channel_id, published_at, content_type, section, team_ids, metadata_checked_at, data, search_text, best_key)
  SELECT e->'v'->>'youtubeId', e->'v'->>'channelId', (e->'v'->>'publishedAt')::timestamptz,
         e->'v'->'labels'->>'contentType', e->>'section',
         ARRAY(SELECT jsonb_array_elements_text(e->'v'->'labels'->'teamIds')),
         (e->'v'->'provenance'->>'metadataCheckedAt')::timestamptz, e->'v', e->>'search', (e->>'best')::double precision
  FROM jsonb_array_elements($1::jsonb) AS e
  ON CONFLICT (youtube_id) DO UPDATE SET
    channel_id = EXCLUDED.channel_id, published_at = EXCLUDED.published_at, content_type = EXCLUDED.content_type,
    section = EXCLUDED.section, team_ids = EXCLUDED.team_ids, metadata_checked_at = EXCLUDED.metadata_checked_at,
    data = EXCLUDED.data, search_text = EXCLUDED.search_text, best_key = EXCLUDED.best_key, updated_at = now()
  WHERE videos.data IS DISTINCT FROM EXCLUDED.data OR videos.search_text IS DISTINCT FROM EXCLUDED.search_text OR videos.best_key IS DISTINCT FROM EXCLUDED.best_key
  RETURNING (xmax = 0) AS inserted`;

const PUBLISH_VERSION = `
  INSERT INTO catalog_versions (mode, video_count, newest_published_at, run_id)
  SELECT $1, count(*), max(published_at), $2 FROM videos
  RETURNING version`;

const REMOVE_VIDEOS = `DELETE FROM videos WHERE youtube_id IN (SELECT jsonb_array_elements_text($1::jsonb)) RETURNING youtube_id`;

const EXISTING = `SELECT v.youtube_id, v.data, v.search_text, v.best_key FROM videos v WHERE v.youtube_id IN (SELECT jsonb_array_elements_text($1::jsonb))`;

const CURRENT_VERSION = `SELECT COALESCE(max(version), 0) AS version FROM catalog_versions`;

/** JSON with object keys in a fixed order, so two equal records compare equal however they were built. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Validates every record (nothing is written if any is invalid) and keeps one record per YouTube id, the last one given. */
function prepare(videos: Video[]): Video[] {
  const byId = new Map<string, Video>();
  for (const video of videos) byId.set(video.youtubeId, videoSchema.parse(video));
  return [...byId.values()];
}

function writeStatements(videos: Video[]): { statements: Statement[]; videoStatementIndexes: number[] } {
  const statements: Statement[] = [];
  const videoStatementIndexes: number[] = [];
  for (const group of chunks(videos, CHUNK_SIZE)) {
    statements.push({ sql: UPSERT_CHANNELS, params: [JSON.stringify(group)] });
    videoStatementIndexes.push(statements.length);
    statements.push({ sql: UPSERT_VIDEOS, params: [JSON.stringify(group.map((video) => ({ v: video, section: sectionOf(video.labels), search: searchTextFor(video), best: bestKey(video) })))] });
  }
  return { statements, videoStatementIndexes };
}

/**
 * Upserts videos and, if anything changed, publishes a new catalog version in
 * one transaction. The version cannot exist without the rows it describes, and
 * a failure leaves both unchanged. A replay that changes nothing writes nothing
 * and keeps the current version, so clients polling it see no false change. Nothing here deletes: a source that failed to answer never
 * removes a video; only the retention rules do (see pruneExpired).
 */
export async function publishVideos(
  db: Db,
  input: Video[],
  options: {
    mode: Catalog["mode"];
    runId?: number | null;
    /** Ids YouTube confirmed are gone. Removed in the same transaction; never a guess from a failed request. */
    remove?: string[];
  },
): Promise<PublishResult> {
  const videos = prepare(input);
  const remove = [...new Set(options.remove ?? [])];

  // Compare with what is stored first. The write below stays atomic; this only decides whether there is anything to write.
  const stored = new Map(
    (await db.query<{ youtube_id: string; data: unknown; search_text: string; best_key: number }>(EXISTING, [JSON.stringify(videos.map((video) => video.youtubeId))])).map((row) => [row.youtube_id, `${canonical(row.data)}|${row.search_text}|${row.best_key}`]),
  );
  const present = remove.length > 0 ? (await db.query(EXISTING, [JSON.stringify(remove)])).length : 0;
  if (present === 0 && videos.every((video) => stored.get(video.youtubeId) === `${canonical(video)}|${searchTextFor(video)}|${bestKey(video)}`)) {
    const [current] = await db.query<{ version: string | number }>(CURRENT_VERSION);
    return { version: Number(current!.version), published: false, inserted: 0, updated: 0, unchanged: videos.length, removed: 0 };
  }

  const { statements, videoStatementIndexes } = writeStatements(videos);
  const removeIndex = remove.length > 0 ? statements.push({ sql: REMOVE_VIDEOS, params: [JSON.stringify(remove)] }) - 1 : -1;
  statements.push({ sql: PUBLISH_VERSION, params: [options.mode, options.runId ?? null] });
  const results = await db.batch(statements);

  let inserted = 0;
  let updated = 0;
  for (const index of videoStatementIndexes) {
    for (const row of results[index]!) {
      if (row.inserted) inserted++;
      else updated++;
    }
  }
  const version = Number(results[results.length - 1]![0]!.version);
  const removed = removeIndex >= 0 ? results[removeIndex]!.length : 0;
  return { version, published: true, inserted, updated, unchanged: videos.length - inserted - updated, removed };
}

/** Loads a catalog (for example the live /catalog.json) into the database. Only inserts and updates. */
export async function importCatalog(db: Db, catalog: unknown): Promise<PublishResult> {
  const parsed = catalogSchema.parse(catalog);
  return publishVideos(db, parsed.videos, { mode: parsed.mode });
}

export interface RetentionLimits {
  /** Videos published longer ago than this are dropped. */
  retentionDays: number;
  /** YouTube Data API metadata must be refreshed or deleted within this many days. */
  maxMetadataAgeDays: number;
}

const DAY_MS = 86_400_000;

/**
 * Removes videos that aged out, and publishes a version when it did. This is
 * the only deletion. It looks at dates and nothing else, so an outage upstream
 * can never shrink the catalog.
 */
export async function pruneExpired(db: Db, now: Date, limits: RetentionLimits): Promise<{ deleted: number; version: number | null }> {
  const oldestPublished = new Date(now.getTime() - limits.retentionDays * DAY_MS).toISOString();
  const oldestChecked = new Date(now.getTime() - limits.maxMetadataAgeDays * DAY_MS).toISOString();
  const [rows] = await db.batch([
    {
      sql: `WITH gone AS (
              DELETE FROM videos
              WHERE published_at < $1 OR (data->'provenance'->>'discoveryMethod' = 'data-api' AND metadata_checked_at < $2)
              RETURNING youtube_id, published_at
            ), latest AS (
              SELECT mode FROM catalog_versions ORDER BY version DESC LIMIT 1
            ), version AS (
              INSERT INTO catalog_versions (mode, video_count, newest_published_at)
              SELECT COALESCE((SELECT mode FROM latest), 'feed'),
                     (SELECT count(*) FROM videos WHERE youtube_id NOT IN (SELECT youtube_id FROM gone)),
                     (SELECT max(published_at) FROM videos WHERE youtube_id NOT IN (SELECT youtube_id FROM gone))
              WHERE EXISTS (SELECT 1 FROM gone)
              RETURNING version
            )
            SELECT (SELECT count(*) FROM gone) AS deleted, (SELECT version FROM version) AS version`,
      params: [oldestPublished, oldestChecked],
    },
  ]);
  const row = rows![0]!;
  return { deleted: Number(row.deleted), version: row.version === null ? null : Number(row.version) };
}

/** How long finished runs and superseded versions are kept for looking back. */
export const HISTORY_DAYS = 30;

/**
 * Trims the bookkeeping tables, which otherwise grow by about 288 rows a day each. Always kept: the newest catalog
 * version (it is the identity every client and cache compares), the latest run, the latest run that did not fail (health
 * reads it), and any run a kept version points to. Returns how many rows went.
 */
export async function pruneHistory(db: Db, now: Date, days: number = HISTORY_DAYS): Promise<{ versions: number; runs: number }> {
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [versions, runs] = await db.batch([
    {
      sql: `WITH gone AS (
              DELETE FROM catalog_versions
              WHERE published_at < $1 AND version < (SELECT max(version) FROM catalog_versions)
              RETURNING version
            ) SELECT count(*) AS n FROM gone`,
      params: [cutoff],
    },
    {
      sql: `WITH gone AS (
              DELETE FROM ingestion_runs
              WHERE started_at < $1
                AND run_id NOT IN (SELECT run_id FROM catalog_versions WHERE run_id IS NOT NULL)
                AND run_id <> COALESCE((SELECT max(run_id) FROM ingestion_runs), -1)
                AND run_id <> COALESCE((SELECT max(run_id) FROM ingestion_runs WHERE status IN ('succeeded', 'partial')), -1)
              RETURNING run_id
            ) SELECT count(*) AS n FROM gone`,
      params: [cutoff],
    },
  ]);
  return { versions: Number(versions![0]!.n), runs: Number(runs![0]!.n) };
}
