import type { Db } from "./db";
import { MIGRATIONS } from "./migrations";

// Any constant works; it only has to be the same for every migrator.
const MIGRATION_LOCK = 727_274;

/**
 * Applies pending migrations and returns the ids it applied. Each one runs in a
 * transaction with an advisory lock, so two processes migrating at once take
 * turns, and a failure leaves the migration unapplied rather than half done.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query<{ id: string }>(`SELECT id FROM schema_migrations`)).map((row) => row.id));
  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.batch([
      { sql: `SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})` },
      ...migration.statements.map((sql) => ({ sql })),
      { sql: `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, params: [migration.id] },
    ]);
    ran.push(migration.id);
  }
  return ran;
}
