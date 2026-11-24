/**
 * The only database surface the app uses. Two adapters implement it: Neon
 * over HTTP in production (src/db/neon.ts) and PGlite, which is real Postgres
 * in WebAssembly, for tests and local work (src/db/pglite.ts).
 */
export type Row = Record<string, unknown>;

export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs the statements in order as one transaction: all of them take effect or none do. Returns each statement's rows. */
  batch(statements: Statement[]): Promise<Row[][]>;
}
