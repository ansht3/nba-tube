/**
 * Schema, in order. Every statement is idempotent (IF NOT EXISTS), so a
 * migration that is interrupted or run by two processes at once is safe to
 * repeat. They live in code, not .sql files, so they bundle into a Worker.
 * Never edit an applied migration: add a new one.
 */
export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_catalog",
    statements: [
      `CREATE TABLE IF NOT EXISTS channels (
         channel_id text COLLATE "C" PRIMARY KEY,
         title text NOT NULL,
         publisher_type text NOT NULL CHECK (publisher_type IN ('league', 'team')),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      // The full validated record lives in data; the columns beside it exist to be filtered and ordered by.
      `CREATE TABLE IF NOT EXISTS videos (
         youtube_id text COLLATE "C" PRIMARY KEY CHECK (length(youtube_id) = 11),
         channel_id text COLLATE "C" NOT NULL REFERENCES channels (channel_id),
         published_at timestamptz NOT NULL,
         content_type text NOT NULL,
         section text NOT NULL,
         team_ids text[] NOT NULL DEFAULT '{}',
         metadata_checked_at timestamptz NOT NULL,
         data jsonb NOT NULL,
         first_seen_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      // Every list is "newest first, ties by id", so each filter gets an index in exactly that order.
      `CREATE INDEX IF NOT EXISTS videos_published_idx ON videos (published_at DESC, youtube_id)`,
      `CREATE INDEX IF NOT EXISTS videos_type_idx ON videos (content_type, published_at DESC, youtube_id)`,
      `CREATE INDEX IF NOT EXISTS videos_section_idx ON videos (section, published_at DESC, youtube_id)`,
      `CREATE INDEX IF NOT EXISTS videos_channel_idx ON videos (channel_id, published_at DESC, youtube_id)`,
      `CREATE INDEX IF NOT EXISTS videos_teams_idx ON videos USING GIN (team_ids)`,
      `CREATE TABLE IF NOT EXISTS ingestion_runs (
         run_id bigserial PRIMARY KEY,
         owner text NOT NULL,
         started_at timestamptz NOT NULL DEFAULT now(),
         finished_at timestamptz,
         status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
         discovered integer NOT NULL DEFAULT 0,
         accepted integer NOT NULL DEFAULT 0,
         rejected integer NOT NULL DEFAULT 0,
         updated integer NOT NULL DEFAULT 0,
         failed integer NOT NULL DEFAULT 0,
         error text
       )`,
      `CREATE TABLE IF NOT EXISTS source_checkpoints (
         channel_id text COLLATE "C" PRIMARY KEY,
         last_attempt_at timestamptz,
         last_success_at timestamptz,
         newest_seen_at timestamptz,
         consecutive_failures integer NOT NULL DEFAULT 0,
         last_error text
       )`,
      // A new row is a new published catalog. version is a plain increasing integer, which is what clients compare.
      `CREATE TABLE IF NOT EXISTS catalog_versions (
         version bigserial PRIMARY KEY,
         published_at timestamptz NOT NULL DEFAULT now(),
         mode text NOT NULL CHECK (mode IN ('seed', 'feed', 'api')),
         video_count integer NOT NULL,
         newest_published_at timestamptz,
         run_id bigint REFERENCES ingestion_runs (run_id)
       )`,
    ],
  },
];
