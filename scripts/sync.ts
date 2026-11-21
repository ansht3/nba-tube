/**
 * Rebuilds the catalog from the verified channels.
 *
 *   npm run sync            Data API when YOUTUBE_API_KEY is set, Atom feeds otherwise
 *   npm run sync -- --mode=feed
 *   npm run seed            small keyless snapshot, written to data/seed/catalog.json
 *   npm run sync -- --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Catalog } from "@/catalog/schema";
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import { type SyncStatus } from "@/catalog/status";
import { resolveMode } from "@/ingest/mode";
import { parseOverrides } from "@/ingest/overrides";
import { planFailure, readPreviousCatalog } from "@/ingest/previous";
import { runSync, type SyncReport, type SyncResult } from "@/ingest/sync";
import { createYouTubeApi, YouTubeApiError } from "@/ingest/youtube/api";
import { fetchChannelFeed } from "@/ingest/youtube/feed";
import { checkEmbed } from "@/ingest/youtube/oembed";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const SEED_PATH = path.join(DATA_DIR, "seed", "catalog.json");
const REPORT_PATH = path.join(DATA_DIR, "sync-report.json");
const STATUS_PATH = path.join(DATA_DIR, "sync-status.json");

/** A seed is a small sample, so it takes only the newest few videos of each channel. */
const SEED_VIDEOS_PER_CHANNEL = 8;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  // Write to a temporary file first so an interrupted run never leaves half a catalog behind.
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

/**
 * Where the last published catalog can be downloaded from. A build server
 * starts from a clean checkout with no data/catalog.json, so without this
 * every build would start over and forget videos that have scrolled out of
 * the channel feeds. On Vercel the production URL is provided automatically.
 */
function previousCatalogUrl(): string | null {
  if (process.env.PREVIOUS_CATALOG_URL) return process.env.PREVIOUS_CATALOG_URL;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}/catalog.json` : null;
}

async function previousCatalog(): Promise<Catalog | null> {
  const catalog = await readPreviousCatalog({
    local: () => (existsSync(CATALOG_PATH) ? readJson(CATALOG_PATH) : undefined),
    url: previousCatalogUrl(),
    fetch,
    warn: (message) => console.warn(message),
  });
  if (catalog && !existsSync(CATALOG_PATH)) console.log(`Continuing from the published catalog (${catalog.videos.length} videos).`);
  return catalog;
}

function printReport(report: SyncReport, target: string, dryRun: boolean) {
  console.log(`\nMode: ${report.mode}`);
  console.log(`Discovered ${report.discovered} videos across the approved channels.`);
  console.log(`Catalog: ${report.total} videos (${report.added} added, ${report.removed} removed).`);

  const reasons = Object.entries(report.rejectedByReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    console.log("Rejected:");
    for (const [reason, count] of reasons) console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
  for (const error of report.sourceErrors) console.warn(`Skipped ${error.name}: ${error.message}`);
  if (report.mode === "api") console.log(`Quota units used: ${report.quotaUnitsUsed}`);
  if (report.stoppedEarly) console.warn(`Stopped early: ${report.stoppedEarly}`);
  console.log(dryRun ? "Dry run: nothing was written." : `Wrote ${path.relative(process.cwd(), target)}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      seed: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });

  // Loads YOUTUBE_API_KEY from a local .env file when there is one.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  const mode = resolveMode({ requested: values.mode, seed: values.seed, apiKey });
  if (mode === "feed" && !values.seed && values.mode === undefined) {
    console.log("YOUTUBE_API_KEY is not set: using the keyless channel feeds (15 newest uploads per channel, no durations).");
  }

  const sources = approvedSources(parseSourceRegistry(readJson(path.join(DATA_DIR, "sources.json"))));
  const overrides = parseOverrides(readJson(path.join(DATA_DIR, "overrides.json")));
  const common = { sources, overrides, now: new Date() };

  let result: SyncResult;
  if (mode === "api") {
    const api = createYouTubeApi({ apiKey: apiKey!, fetch });
    result = await runSync({ ...common, mode: "api", api, previous: await previousCatalog() });
  } else {
    result = await runSync({
      ...common,
      mode: "feed",
      fetchFeed: (source) => fetchChannelFeed(source, fetch),
      checkEmbed: (youtubeId) => checkEmbed(youtubeId, fetch),
      // A seed always starts clean so that it only contains what was verified in this run.
      previous: values.seed ? null : await previousCatalog(),
      catalogMode: values.seed ? "seed" : "feed",
      limits: values.seed ? { perSourceLimit: SEED_VIDEOS_PER_CHANNEL } : undefined,
    });
  }

  const target = values.seed ? SEED_PATH : CATALOG_PATH;
  if (!values["dry-run"]) {
    writeJson(target, result.catalog);
    writeJson(REPORT_PATH, result.report);
    if (!values.seed) {
      const status: SyncStatus = { ok: true, finishedAt: new Date().toISOString(), mode: result.catalog.mode, usedFallback: "none", sourceErrors: result.report.sourceErrors.length, error: null };
      writeJson(STATUS_PATH, status);
    }
  }
  printReport(result.report, target, values["dry-run"]);
}

/**
 * A failed sync must not turn into a deploy of the committed seed over a
 * fresher live catalog. Keep the last published catalog, and say so.
 */
async function recordFailure(message: string) {
  if (process.argv.includes("--seed") || process.argv.includes("--dry-run")) return;
  const previous = await previousCatalog().catch(() => null);
  const plan = planFailure(previous, existsSync(CATALOG_PATH));
  if (plan.writePrevious && previous) writeJson(CATALOG_PATH, previous);
  const status: SyncStatus = { ok: false, finishedAt: new Date().toISOString(), mode: null, usedFallback: plan.fallback, sourceErrors: 0, error: message.slice(0, 300) };
  writeJson(STATUS_PATH, status);
  console.error(`Kept ${plan.fallback === "previous-catalog" ? "the last published catalog" : "the committed seed catalog (there was nothing earlier to keep)"}.`);
}

main().catch(async (error: unknown) => {
  // Error messages from the API client never contain the key or a request URL.
  const message = error instanceof YouTubeApiError || error instanceof Error ? error.message : String(error);
  console.error(`Sync failed: ${message}`);
  await recordFailure(message).catch((inner: unknown) => console.error(`Could not record the failure: ${inner instanceof Error ? inner.message : inner}`));
  process.exitCode = 1;
});
