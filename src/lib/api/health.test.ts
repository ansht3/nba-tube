import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { createPgliteDb } from "@/db/pglite";
import { PostgresCatalogRepository } from "@/db/postgres-repository";
import { parseOverrides } from "@/ingest/overrides";
import { runIngestion } from "@/ingest/run";
import type { FetchLike } from "@/ingest/http";
import { makeSource, testId } from "@/test/fixtures";
import { handleUpdates, handleVersion } from "./catalog";
import { evaluateHealth, handleHealth, type IngestionHealth } from "./health";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const meta = { version: "7", generatedAt: ago(10), mode: "feed" as const, total: 300, newestPublishedAt: ago(240), newestId: "abcdefghijk" };
const healthy: IngestionHealth = { lastRunAt: ago(2), lastRunStatus: "succeeded", lastSuccessAt: ago(2), channelsTracked: 31, channelsFailing: 0, oldestSourceSuccessAt: ago(8) };

describe("evaluateHealth", () => {
  it("is ok when the worker succeeded recently and every source was read recently", () => {
    expect(evaluateHealth(meta, healthy, NOW)).toMatchObject({ status: "ok", mode: "database", reasons: [], worker: { state: "ok" }, sources: { state: "ok" } });
  });

  it("does not call a quiet night broken: an old newest video alone is only information", () => {
    const report = evaluateHealth({ ...meta, newestPublishedAt: ago(60 * 30) }, healthy, NOW);
    expect(report.status).toBe("ok");
    expect(report.catalog.newestVideoAgeMinutes).toBe(1800);
  });

  it("is degraded when the worker is late", () => {
    const report = evaluateHealth(meta, { ...healthy, lastSuccessAt: ago(30) }, NOW);
    expect(report).toMatchObject({ status: "degraded", worker: { state: "late", lastSuccessAgeMinutes: 30 } });
    expect(report.reasons.join()).toMatch(/30 minutes ago/);
  });

  it("is down when the worker has not succeeded for an hour, or never has", () => {
    expect(evaluateHealth(meta, { ...healthy, lastSuccessAt: ago(61) }, NOW)).toMatchObject({ status: "down", worker: { state: "down" } });
    expect(evaluateHealth(meta, { ...healthy, lastRunAt: null, lastRunStatus: null, lastSuccessAt: null }, NOW)).toMatchObject({ status: "down", reasons: ["The worker has never completed a run."] });
  });

  it("is degraded when several channels keep failing or a channel has not been read for an hour, even while the worker runs", () => {
    expect(evaluateHealth(meta, { ...healthy, channelsFailing: 3 }, NOW)).toMatchObject({ status: "degraded", worker: { state: "ok" }, sources: { state: "stale", channelsFailing: 3 } });
    expect(evaluateHealth(meta, { ...healthy, oldestSourceSuccessAt: ago(90) }, NOW)).toMatchObject({ status: "degraded", sources: { state: "stale", oldestSuccessAgeMinutes: 90 } });
    expect(evaluateHealth(meta, { ...healthy, channelsFailing: 2 }, NOW).status).toBe("ok");
  });

  it("reports the file catalog as ok with no worker to check", () => {
    expect(evaluateHealth(meta, null, NOW)).toMatchObject({ status: "ok", mode: "file", worker: { state: "unknown" } });
  });
});

describe("the pipeline: ingestion, then what viewers and operators see", () => {
  let pg: PGlite;
  let repo: PostgresCatalogRepository;
  const CHANNEL = "UC" + "A".repeat(22);
  const entry = (id: string, published: string) => ` <entry><yt:videoId>${id}</yt:videoId><yt:channelId>${CHANNEL}</yt:channelId><title>Player Name Game Highlights | November 15, 2026</title><author><name>NBA</name></author><published>${published}</published><media:group><media:thumbnail url="https://i4.ytimg.com/vi/${id}/hqdefault.jpg"/></media:group></entry>`;
  const run = (fetchImpl: FetchLike, owner: string) =>
    runIngestion({ db: createPgliteDb(pg), sources: [makeSource({ channelId: CHANNEL, name: "Team" })], overrides: parseOverrides({ schemaVersion: 1, include: [], exclude: [] }), fetch: fetchImpl, owner, now: () => new Date(), options: { retry: { retries: 2, baseDelayMs: 1, sleep: async () => {} } } });

  beforeAll(async () => {
    pg = new PGlite();
    const db = createPgliteDb(pg);
    await migrate(db);
    repo = new PostgresCatalogRepository(db);
  });
  afterAll(async () => pg.close());

  it("retries a busy source, publishes, and shows the new video through version, updates and health", async () => {
    let feedCalls = 0;
    const published = new Date(Date.now() - 20 * 60_000).toISOString();
    const youtube: FetchLike = async (url) => {
      if (/feeds\/videos\.xml/.test(url)) {
        feedCalls += 1;
        // The source answers 503 twice before it works: the worker's retries absorb it.
        return feedCalls <= 2 ? new Response("busy", { status: 503 }) : new Response(`<feed>${entry(testId("fresh1"), published)}</feed>`, { status: 200 });
      }
      return new Response(JSON.stringify({ title: "t", author_name: "a" }), { status: 200 });
    };

    const before = await repo.meta();
    const summary = await run(youtube, "run-1");
    expect(summary).toMatchObject({ status: "succeeded", updated: 1, published: true });
    expect(feedCalls).toBe(3);

    const versionBody = (await (await handleVersion(new Request("https://t.test/api/version"), repo)).json()) as { version: string; newestId: string };
    expect(versionBody.version).not.toBe(before.version);
    expect(versionBody.newestId).toBe(testId("fresh1"));
    const updates = (await (await handleUpdates(new Request("https://t.test/api/updates?since=notyetseen_"), repo)).json()) as { reset: boolean };
    expect(updates.reset).toBe(true);

    const health = await handleHealth(repo);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", mode: "database", worker: { state: "ok", lastRunStatus: "succeeded" }, sources: { channelsTracked: 1, channelsFailing: 0 }, catalog: { total: 1 } });
    expect(health.headers.get("cache-control")).toBe("no-store");
  });

  it("reports a down source in health without losing the catalog, then recovers", async () => {
    const down: FetchLike = async () => new Response("down", { status: 503 });
    const summary = await run(down, "run-2");
    expect(summary.status).toBe("failed");
    expect((await repo.meta()).total).toBe(1);
    const report = (await (await handleHealth(repo)).json()) as { worker: { lastRunStatus: string }; sources: { channelsFailing: number } };
    expect(report.worker.lastRunStatus).toBe("failed");
  });
});
