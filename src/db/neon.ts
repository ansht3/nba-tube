import { neon } from "@neondatabase/serverless";
import type { Db, Row, Statement } from "./db";

/**
 * Neon over HTTP: no connection to manage, so it works the same from a Vercel
 * function and from a Cloudflare Worker. The URL is a secret and stays in the
 * server-side environment.
 */
export function createNeonDb(databaseUrl: string): Db {
  const sql = neon(databaseUrl);
  return {
    async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
      return (await sql.query(text, params)) as T[];
    },
    async batch(statements: Statement[]): Promise<Row[][]> {
      // A non-interactive transaction: the statements are sent together and committed together.
      return (await sql.transaction((txn) => statements.map((s) => txn.query(s.sql, s.params ?? [])))) as Row[][];
    },
  };
}
