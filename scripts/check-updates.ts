/**
 * Answers two questions for the scheduled refresh:
 *   1. Has an official channel published a video that belongs on the site but
 *      is not on it yet? (then a rebuild is needed)
 *   2. Is the refresh actually keeping up? A video still missing an hour after
 *      upload means rebuilds are not publishing, whatever the workflow says.
 *
 *   SITE_URL=https://example.vercel.app npm run check-updates
 *
 * It reads the keyless channel feeds (31 requests, no quota) and the live
 * catalog.json, and never writes anything except $GITHUB_OUTPUT and
 * $GITHUB_STEP_SUMMARY. Outputs: changed, pending, status, oldest_pending_minutes.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { catalogSchema } from "@/catalog/schema";
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import { mapWithConcurrency } from "@/ingest/http";
import { parseOverrides } from "@/ingest/overrides";
import { DEFAULT_LIMITS } from "@/ingest/sync";
import { pendingCandidates, refreshStatus } from "@/ingest/updates";
import { fetchChannelFeed } from "@/ingest/youtube/feed";
import { checkEmbed } from "@/ingest/youtube/oembed";

type Status = "current" | "pending" | "stuck" | "unreachable";

interface Result {
  changed: boolean;
  pending: number;
  status: Status;
  oldestPendingMinutes: number | null;
  catalogAgeHours: number | null;
  lastSync: string;
  lines: string[];
}

function publish(result: Result) {
  const outputs = {
    changed: result.changed,
    pending: result.pending,
    status: result.status,
    oldest_pending_minutes: result.oldestPendingMinutes ?? "",
  };
  for (const line of result.lines.slice(0, 20)) console.log(line);
  if (result.lines.length > 20) console.log(`...and ${result.lines.length - 20} more`);
  for (const [key, value] of Object.entries(outputs)) console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(""));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = [
      ["Refresh status", result.status],
      ["Videos waiting to be published", String(result.pending)],
      ["Oldest waiting video", result.oldestPendingMinutes === null ? "none" : `${result.oldestPendingMinutes} minutes since upload`],
      ["Live catalog age", result.catalogAgeHours === null ? "unknown" : `${result.catalogAgeHours} hours`],
      ["Last build's sync", result.lastSync],
    ];
    const table = ["| | |", "|---|---|", ...rows.map(([name, value]) => `| ${name} | ${value} |`)].join("\n");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## NBATube refresh\n\n${table}\n\n${result.lines.map((line) => `- ${line}`).join("\n")}\n`);
  }
}

async function liveStatus(site: string): Promise<string> {
  try {
    const response = await fetch(`${site}/status.json`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return `not published (HTTP ${response.status}); the live site predates /status.json`;
    const body = (await response.json()) as { sync?: { ok: boolean; usedFallback: string; error: string | null } | null };
    if (!body.sync) return "no sync record";
    return body.sync.ok ? "ok" : `FAILED, kept ${body.sync.usedFallback}: ${body.sync.error ?? "no message"}`;
  } catch (error) {
    return `unreadable (${error instanceof Error ? error.message : error})`;
  }
}

async function main(): Promise<Result> {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  const now = new Date();
  if (!site) {
    // A rebuild is always safe, but nobody can tell whether it published anything.
    return { changed: true, pending: 0, status: "unreachable", oldestPendingMinutes: null, catalogAgeHours: null, lastSync: "unknown", lines: ["SITE_URL is not set, so the live catalog cannot be compared."] };
  }

  const response = await fetch(`${site}/catalog.json`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    return { changed: true, pending: 0, status: "unreachable", oldestPendingMinutes: null, catalogAgeHours: null, lastSync: "unknown", lines: [`The live catalog returned HTTP ${response.status}.`] };
  }
  const live = catalogSchema.parse(await response.json());
  const published = new Set(live.videos.map((video) => video.youtubeId));

  const sources = approvedSources(parseSourceRegistry(JSON.parse(readFileSync("data/sources.json", "utf8"))));
  const overrides = parseOverrides(JSON.parse(readFileSync("data/overrides.json", "utf8")));
  const feeds = await mapWithConcurrency(sources, 6, (source) => fetchChannelFeed(source, fetch).catch(() => []));

  const candidates = pendingCandidates({ published, feeds: feeds.flat(), sources, overrides, now, retentionDays: DEFAULT_LIMITS.retentionDays });
  const embeddable = await mapWithConcurrency(candidates, 6, async (candidate) => (await checkEmbed(candidate.youtubeId, fetch)).status === "ok");
  const missing = candidates.filter((_, index) => embeddable[index]);
  const { status, oldestPendingMinutes } = refreshStatus(missing, now);

  return {
    changed: missing.length > 0,
    pending: missing.length,
    status,
    oldestPendingMinutes,
    catalogAgeHours: Math.round((now.getTime() - Date.parse(live.generatedAt)) / 3_600_000),
    lastSync: await liveStatus(site),
    lines: missing.map((video) => `New: ${video.channelTitle}: ${video.title}`),
  };
}

main()
  .then(publish)
  .catch((error: unknown) => {
    // A failed check must not block a refresh (rebuilding is always safe), but it must not look healthy either.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::warning title=Update check failed::${message}`);
    publish({ changed: true, pending: 0, status: "unreachable", oldestPendingMinutes: null, catalogAgeHours: null, lastSync: "unknown", lines: [`The check itself failed: ${message}`] });
  });
