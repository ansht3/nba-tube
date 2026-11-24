/**
 * Reproducible load test.
 *
 *   npm run load-test                          in-process API over Postgres (PGlite) with 3000 videos
 *   npm run load-test -- --url http://localhost:3000   the same traffic over HTTP against a running `npm run start`
 *   npm run load-test -- --videos 3000 --concurrency 50 --requests 4000
 *
 * Reports throughput, p50/p95/p99 latency, error rate, how many database
 * queries each request cost, and how often a repeat request was answered with
 * 304. The in-process numbers measure our code and our SQL on PGlite (Postgres
 * in WebAssembly, single-threaded), not Neon's network latency or scale: read
 * them as relative costs, and run it against a real deployment with --url.
 */
import { parseArgs } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { publishVideos } from "@/db/catalog-store";
import type { Db } from "@/db/db";
import { migrate } from "@/db/migrate";
import { createPgliteDb } from "@/db/pglite";
import { PostgresCatalogRepository } from "@/db/postgres-repository";
import type { Video } from "@/catalog/schema";
import { CONTENT_TYPES } from "@/catalog/content-types";
import { TEAMS } from "@/catalog/teams";
import { handleListVideos } from "@/lib/api/videos";

const { values } = parseArgs({ options: { url: { type: "string" }, videos: { type: "string", default: "3000" }, concurrency: { type: "string", default: "50" }, requests: { type: "string", default: "4000" } } });
const VIDEOS = Number(values.videos);
const CONCURRENCY = Number(values.concurrency);
const REQUESTS = Number(values.requests);

/** Deterministic synthetic catalog with realistic spread over types, teams and the last 45 days. */
function synthetic(count: number): Video[] {
  const base = Date.parse("2026-11-16T12:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const id = `v${String(i).padStart(10, "0")}`;
    const teams = [TEAMS[i % TEAMS.length]!.id, ...(i % 3 === 0 ? [TEAMS[(i * 7 + 1) % TEAMS.length]!.id] : [])];
    return {
      youtubeId: id,
      title: `Player ${i % 97} ${i % 2 ? "Game Highlights" : "Postgame Press Conference"} | November ${(i % 28) + 1}, 2026`,
      channelId: `UC${String(i % 31).padStart(22, "0")}`,
      channelTitle: `Channel ${i % 31}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: new Date(base - i * 13 * 60_000).toISOString(),
      durationSeconds: i % 4 === 0 ? null : 60 + ((i * 37) % 1800),
      embeddable: true,
      labels: { contentType: CONTENT_TYPES[i % CONTENT_TYPES.length]!, gamePhase: null, teamIds: teams, playerNames: [], reason: "synthetic" },
      provenance: { publisherType: i % 31 === 0 ? "league" : "team", discoveryMethod: "channel-feed", verificationStatus: "verified-publisher", metadataCheckedAt: new Date(base).toISOString() },
    } as Video;
  });
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
interface Result { ok: number; errors: number; notModified: number; latencies: number[]; wallMs: number }

/** Runs `total` calls with `concurrency` at a time and times each. */
async function drive(total: number, concurrency: number, call: (n: number) => Promise<number>): Promise<Result> {
  const latencies: number[] = [];
  let ok = 0, errors = 0, notModified = 0, next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < total) {
      const n = next++;
      const t0 = performance.now();
      try {
        const status = await call(n);
        if (status === 304) notModified++;
        if (status === 200 || status === 304) ok++; else errors++;
      } catch { errors++; }
      latencies.push(performance.now() - t0);
    }
  }));
  return { ok, errors, notModified, latencies: latencies.sort((a, b) => a - b), wallMs: performance.now() - started };
}

function report(label: string, r: Result, extra = "") {
  const total = r.ok + r.errors;
  console.log(`${label.padEnd(34)} ${String(total).padStart(5)} req  ${(total / (r.wallMs / 1000)).toFixed(0).padStart(6)} req/s  p50 ${pct(r.latencies, 50).toFixed(1).padStart(7)} ms  p95 ${pct(r.latencies, 95).toFixed(1).padStart(7)} ms  p99 ${pct(r.latencies, 99).toFixed(1).padStart(7)} ms  errors ${(100 * r.errors / total).toFixed(2)}%  304s ${r.notModified}${extra}`);
}

/** A realistic mix: mostly the first page, some deep pages, some filters, some searches. */
const mix = (cursors: string[]) => (n: number): string => {
  const kind = n % 10;
  if (kind < 4) return "";
  if (kind < 6) return `?cursor=${encodeURIComponent(cursors[n % cursors.length]!)}`;
  if (kind < 8) return `?team=${TEAMS[n % TEAMS.length]!.id}`;
  if (kind === 8) return `?q=player%20${n % 97}`;
  return `?section=postgame&sort=best`;
};

async function inProcess() {
  console.log(`In-process over Postgres (PGlite): ${VIDEOS} videos, ${CONCURRENCY} concurrent clients, ${REQUESTS} requests\n`);
  const pg = new PGlite();
  const inner = createPgliteDb(pg);
  let queries = 0;
  const db: Db = { query: (sql, params) => (queries++, inner.query(sql, params)), batch: inner.batch };
  await migrate(db);
  const t0 = performance.now();
  await publishVideos(db, synthetic(VIDEOS), { mode: "feed" });
  console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
  const repo = new PostgresCatalogRepository(db);

  // Cursors from a walk of the catalog, to use as deep-page requests.
  const cursors: string[] = [];
  for (let c: string | null = null, i = 0; i < 40; i++) { const page = await repo.list({ limit: 24, cursor: c }); if (!page.nextCursor) break; cursors.push(page.nextCursor); c = page.nextCursor; }
  const queryString = mix(cursors);
  const get = async (n: number, headers: Record<string, string> = {}) => (await handleListVideos(new Request(`https://load.test/api/videos${queryString(n)}`, { headers }), repo)).status;

  queries = 0;
  const cold = await drive(REQUESTS, CONCURRENCY, (n) => get(n));
  report("mixed traffic, no cache", cold, `  queries/req ${(queries / REQUESTS).toFixed(2)}`);

  // The same traffic with a client that already holds the answer (what a CDN revalidation or a browser repeat does).
  const etags = new Map<string, string>();
  for (let n = 0; n < 10; n++) { const r = await handleListVideos(new Request(`https://load.test/api/videos${queryString(n)}`), repo); etags.set(queryString(n), r.headers.get("etag")!); }
  queries = 0;
  const warm = await drive(REQUESTS, CONCURRENCY, (n) => get(n % 10, { "if-none-match": etags.get(queryString(n % 10))! }));
  report("repeat requests with If-None-Match", warm, `  queries/req ${(queries / REQUESTS).toFixed(2)}`);
  console.log(`\nA 304 costs ${(queries / REQUESTS).toFixed(2)} query per request (the version lookup); the list query is skipped.`);
  await pg.close();
}

async function overHttp(base: string) {
  console.log(`Over HTTP against ${base}: ${CONCURRENCY} concurrent clients, ${REQUESTS} requests\n`);
  const catalogBytes = (await (await fetch(`${base}/catalog.json`)).text()).length;
  const first = await fetch(`${base}/api/videos`);
  const pageBytes = (await first.text()).length;
  const versionBytes = (await (await fetch(`${base}/api/version`)).text()).length;
  const etag = first.headers.get("etag")!;
  const realCold = await drive(REQUESTS, CONCURRENCY, async (n) => { const r = await fetch(`${base}/api/videos${n % 3 ? "" : "?team=LAL"}`); await r.arrayBuffer(); return r.status; });
  const realWarm = await drive(REQUESTS, CONCURRENCY, async () => { const r = await fetch(`${base}/api/videos`, { headers: { "If-None-Match": etag } }); await r.arrayBuffer(); return r.status; });
  const versionPoll = await drive(REQUESTS, CONCURRENCY, async () => { const r = await fetch(`${base}/api/version`); await r.arrayBuffer(); return r.status; });
  report("GET /api/videos", realCold);
  report("GET /api/videos If-None-Match", realWarm);
  report("GET /api/version", versionPoll);
  console.log(`\nPayloads: whole /catalog.json ${(catalogBytes / 1024).toFixed(0)} KB (what every visitor used to download), one page of 24 ${(pageBytes / 1024).toFixed(1)} KB, version check ${versionBytes} B.`);
}

(values.url ? overHttp(values.url.replace(/\/$/, "")) : inProcess()).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
