import type { PGlite } from "@electric-sql/pglite";
import type { Db, Row, Statement } from "./db";

/** Wraps a PGlite instance (Postgres in WebAssembly) as a Db. For tests and local work, never production. */
export function createPgliteDb(pg: PGlite): Db {
  return {
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      return (await pg.query<T>(text, params)).rows;
    },
    async batch(statements: Statement[]): Promise<Row[][]> {
      return pg.transaction(async (tx) => {
        const results: Row[][] = [];
        for (const statement of statements) results.push((await tx.query<Row>(statement.sql, statement.params ?? [])).rows);
        return results;
      });
    },
  };
}
