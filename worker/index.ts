/**
 * Cloudflare Worker: runs one ingestion pass on a schedule (every five minutes,
 * see wrangler.toml), independent of any frontend deploy. All logic lives in
 * src/ingest/run.ts; this file only wires secrets, the channel allowlist and
 * the clock.
 *
 * Secrets (wrangler secret put): DATABASE_URL (required), YOUTUBE_API_KEY (optional).
 * Variable: MAX_CHANNELS_PER_RUN (optional; see docs/INGESTION.md for the plan limit).
 */
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import { createNeonDb } from "@/db/neon";
import { parseOverrides } from "@/ingest/overrides";
import { runIngestion } from "@/ingest/run";
import { createYouTubeApi } from "@/ingest/youtube/api";
import overridesJson from "../data/overrides.json";
import sourcesJson from "../data/sources.json";

export interface Env {
  DATABASE_URL: string;
  YOUTUBE_API_KEY?: string;
  MAX_CHANNELS_PER_RUN?: string;
}

const sources = approvedSources(parseSourceRegistry(sourcesJson));
const overrides = parseOverrides(overridesJson);

async function run(env: Env): Promise<void> {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set on the Worker.");
  const maxChannels = Number(env.MAX_CHANNELS_PER_RUN);
  const summary = await runIngestion({
    db: createNeonDb(env.DATABASE_URL),
    sources,
    overrides,
    fetch: (url, init) => fetch(url, init),
    api: env.YOUTUBE_API_KEY ? createYouTubeApi({ apiKey: env.YOUTUBE_API_KEY, fetch: (url, init) => fetch(url, init) }) : undefined,
    owner: crypto.randomUUID(),
    options: Number.isFinite(maxChannels) && maxChannels > 0 ? { maxChannelsPerRun: maxChannels } : undefined,
  });
  // One structured line per run. It contains counts and channel names, never a secret.
  console.log(JSON.stringify({ event: "ingestion", ...summary }));
  // A failed run is an error in the Worker's logs and dashboard, not a quiet success.
  if (summary.status === "failed") throw new Error(summary.message ?? "Ingestion failed.");
}

const worker = {
  async scheduled(_event: { scheduledTime: number; cron: string }, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(run(env));
  },
  // Nothing to serve: the Worker exists to run on its schedule.
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
