/**
 * Answers one question cheaply: has an official channel published a video
 * that belongs on the site but is not on it yet? Used by the scheduled
 * refresh so that Vercel only rebuilds when there is something new.
 *
 *   SITE_URL=https://example.vercel.app npm run check-updates
 *
 * It reads the keyless channel feeds (31 requests, no quota) and the live
 * catalog.json, and never writes anything. It prints "changed=true" or
 * "changed=false", and appends the same line to $GITHUB_OUTPUT when set.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { catalogSchema } from "@/catalog/schema";
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import { decide } from "@/ingest/decide";
import { mapWithConcurrency } from "@/ingest/http";
import { parseOverrides } from "@/ingest/overrides";
import { DEFAULT_LIMITS } from "@/ingest/sync";
import { fetchChannelFeed } from "@/ingest/youtube/feed";
import { checkEmbed } from "@/ingest/youtube/oembed";

function report(changed: boolean) {
  console.log(`changed=${changed}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

async function main() {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  if (!site) {
    console.log("SITE_URL is not set, so there is nothing to compare with. Treating it as changed.");
    return report(true);
  }

  const response = await fetch(`${site}/catalog.json`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    console.log(`The live catalog returned HTTP ${response.status}. Treating it as changed.`);
    return report(true);
  }
  const live = catalogSchema.parse(await response.json());
  const published = new Set(live.videos.map((video) => video.youtubeId));

  const sources = approvedSources(parseSourceRegistry(JSON.parse(readFileSync("data/sources.json", "utf8"))));
  const overrides = parseOverrides(JSON.parse(readFileSync("data/overrides.json", "utf8")));
  const bySource = new Map(sources.map((source) => [source.channelId, source]));
  const now = new Date();

  const feeds = await mapWithConcurrency(sources, 6, (source) => fetchChannelFeed(source, fetch).catch(() => []));
  // Only videos the sync would actually publish count. Anything else (too old,
  // rejected by the rules, not embeddable) would trigger a rebuild that adds
  // nothing, and then another one ten minutes later, forever.
  const oldest = now.getTime() - DEFAULT_LIMITS.retentionDays * 86_400_000;
  const candidates = feeds
    .flat()
    .filter((candidate) => !published.has(candidate.youtubeId))
    .filter((candidate) => Date.parse(candidate.publishedAt) >= oldest)
    .filter((candidate) => decide(candidate, bySource.get(candidate.channelId), overrides, now).accepted);
  const embeddable = await mapWithConcurrency(candidates, 6, async (candidate) => (await checkEmbed(candidate.youtubeId, fetch)).status === "ok");
  const missing = candidates.filter((_, index) => embeddable[index]);

  for (const video of missing) console.log(`New: ${video.channelTitle}: ${video.title}`);
  report(missing.length > 0);
}

main().catch((error: unknown) => {
  // A failed check should not block a refresh: rebuilding is always safe.
  console.error(`Check failed: ${error instanceof Error ? error.message : error}`);
  report(true);
});
