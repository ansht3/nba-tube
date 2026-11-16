import type { Db } from "./db";

/**
 * A time-limited lock held in the database, so overlapping scheduled runs (or a
 * run that outlives its slot) cannot work at the same time. The database clock
 * decides expiry, so workers with different clocks agree. A crashed holder
 * loses the lease when it expires; nothing needs cleaning up.
 */
export async function acquireLease(db: Db, name: string, owner: string, seconds: number): Promise<boolean> {
  const rows = await db.query(
    `INSERT INTO leases (name, owner, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3::double precision))
     ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
     WHERE leases.expires_at < now() OR leases.owner = EXCLUDED.owner
     RETURNING owner`,
    [name, owner, seconds],
  );
  return rows.length > 0;
}

/** Extends a lease this owner still holds. False means it expired and someone else may now hold it. */
export async function renewLease(db: Db, name: string, owner: string, seconds: number): Promise<boolean> {
  const rows = await db.query(
    `UPDATE leases SET expires_at = now() + make_interval(secs => $3::double precision)
     WHERE name = $1 AND owner = $2 AND expires_at >= now() RETURNING owner`,
    [name, owner, seconds],
  );
  return rows.length > 0;
}

export async function releaseLease(db: Db, name: string, owner: string): Promise<void> {
  await db.query(`DELETE FROM leases WHERE name = $1 AND owner = $2`, [name, owner]);
}
