import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importCatalog } from "@/db/catalog-store";
import type { Db } from "@/db/db";
import { acquireLease } from "@/db/lease";
import { migrate } from "@/db/migrate";
import { createPgliteDb } from "@/db/pglite";
import { makeSource, testId } from "@/test/fixtures";
import { makeVideo } from "@/test/fixtures";
import type { FetchLike } from "./http";
import { parseOverrides } from "./overrides";
import { runIngestion, type IngestionDeps } from "./run";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = new PGlite();
  db = createPgliteDb(pg);
  await migrate(db);
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec("TRUNCATE videos, channels, catalog_versions, ingestion_runs, source_checkpoints, leases RESTART IDENTITY CASCADE");
});

const CHANNEL_A = "UC" + "A".repeat(22);
const CHANNEL_B = "UC" + "B".repeat(22);
const CHANNEL_C = "UC" + "C".repeat(22);
const sources = [
  makeSource({ channelId: CHANNEL_A, name: "Team A" }),
  makeSource({ channelId: CHANNEL_B, name: "Team B" }),
  makeSource({ channelId: CHANNEL_C, name: "Team C" }),
];
const overrides = parseOverrides({ schemaVersion: 1, include: [], exclude: [] });
const NOW = new Date("2026-11-16T12:00:00Z");
const noRetry = { retries: 0, baseDelayMs: 1, sleep: async () => {} };

interface Upload {
  id: string;
  channelId: string;
  title?: string;
  published?: string;
}
const GOOD = "Player Name Game Highlights | November 15, 2026";

function atom(uploads: Upload[]) {
  const entries = uploads
    .map(
      (u) => ` <entry><yt:videoId>${u.id}</yt:videoId><yt:channelId>${u.channelId}</yt:channelId><title>${u.title ?? GOOD}</title>
  <author><name>Channel</name></author><published>${u.published ?? "2026-11-16T10:00:00+00:00"}</published>
  <media:group><media:thumbnail url="https://i4.ytimg.com/vi/${u.id}/hqdefault.jpg"/></media:group></entry>`,
    )
    .join("");
  return `<?xml version="1.0"?><feed><title>Videos</title>${entries}</feed>`;
}

interface World {
  feeds: Record<string, Upload[] | "down">;
  embed: Record<string, "ok" | "gone" | "error">;
  requests: string[];
}

/** A fake YouTube: Atom feeds per channel and oEmbed answers per video. */
function fakeYouTube(world: World): FetchLike {
  return async (url) => {
    world.requests.push(url);
    const feed = /playlist_id=UULF(.{22})|channel_id=(UC.{22})/.exec(url);
    if (feed) {
      const channelId = feed[2] ?? `UC${feed[1]}`;
      const feedState = world.feeds[channelId];
      if (feedState === "down" || feedState === undefined) return new Response("unavailable", { status: 503 });
      return new Response(atom(feedState), { status: 200 });
    }
    const embed = /oembed.*watch%3Fv%3D([\w-]{11})/.exec(url);
    if (embed) {
      const state = world.embed[embed[1]!] ?? "ok";
      if (state === "gone") return new Response("{}", { status: 404 });
      if (state === "error") return new Response("{}", { status: 500 });
      return new Response(JSON.stringify({ title: "t", author_name: "a" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

const newWorld = (feeds: World["feeds"], embed: World["embed"] = {}): World => ({ feeds, embed, requests: [] });
const deps = (world: World, extra: Partial<IngestionDeps> = {}): IngestionDeps => ({ db, sources, overrides, fetch: fakeYouTube(world), owner: "run-1", now: () => NOW, options: { retry: noRetry }, ...extra });
const count = async (table: string) => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n);
const idsInDb = async () => (await db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos ORDER BY youtube_id`)).map((r) => r.youtube_id);

describe("runIngestion", () => {
  it("discovers new uploads from every channel, stores them, and publishes a version", async () => {
    const world = newWorld({
      [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }],
      [CHANNEL_B]: [{ id: testId("b1"), channelId: CHANNEL_B }],
      [CHANNEL_C]: [],
    });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ status: "succeeded", discovered: 2, accepted: 2, rejected: 0, updated: 2, failed: 0, published: true, version: 1 });
    expect(await idsInDb()).toEqual([testId("a1"), testId("b1")].sort());
    const [run] = await db.query<{ status: string; updated: number; finished_at: string | null }>(`SELECT status, updated, finished_at FROM ingestion_runs`);
    expect(run).toMatchObject({ status: "succeeded", updated: 2 });
    expect(run!.finished_at).not.toBeNull();
  });

  it("counts videos the rules reject without storing them", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("good"), channelId: CHANNEL_A }, { id: testId("junk"), channelId: CHANNEL_A, title: "Behind the scenes with the mascot" }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ discovered: 2, accepted: 1, rejected: 1, updated: 1 });
    expect(await idsInDb()).toEqual([testId("good")]);
  });

  it("is idempotent: a second run over the same feeds writes nothing and keeps the version", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    await runIngestion(deps(world));
    const second = await runIngestion(deps(world, { owner: "run-2" }));
    expect(second).toMatchObject({ status: "succeeded", discovered: 1, updated: 0, published: false, version: 1 });
    expect(await count("catalog_versions")).toBe(1);
    expect(await count("videos")).toBe(1);
  });

  it("handles the same upload appearing on two feeds as one video", async () => {
    const same = { id: testId("dup"), channelId: CHANNEL_A };
    const world = newWorld({ [CHANNEL_A]: [same], [CHANNEL_B]: [same], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ discovered: 1, updated: 1 });
    expect(await count("videos")).toBe(1);
  });

  it("does not block healthy channels when one is down, and reports the failure", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: "down", [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary.status).toBe("partial");
    expect(summary.failed).toBe(1);
    expect(summary.failedChannels).toEqual([expect.objectContaining({ channelId: CHANNEL_B, name: "Team B" })]);
    expect(await idsInDb()).toEqual([testId("a1")]);
    const [checkpoint] = await db.query<{ consecutive_failures: number; last_error: string }>(`SELECT consecutive_failures, last_error FROM source_checkpoints WHERE channel_id = $1`, [CHANNEL_B]);
    expect(checkpoint!.consecutive_failures).toBe(1);
    expect(checkpoint!.last_error).toBeTruthy();
  });

  it("deletes nothing when every source is down", async () => {
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-16T10:00:00.000Z", videos: [makeVideo({ youtubeId: testId("keep"), channelId: CHANNEL_A, publishedAt: "2026-11-15T10:00:00.000Z" })] });
    const world = newWorld({ [CHANNEL_A]: "down", [CHANNEL_B]: "down", [CHANNEL_C]: "down" });
    const summary = await runIngestion(deps(world));
    expect(summary.status).toBe("failed");
    expect(await idsInDb()).toEqual([testId("keep")]);
  });

  it("counts failures up across runs and resets them on success", async () => {
    const world = newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: "down", [CHANNEL_C]: [] });
    await runIngestion(deps(world));
    await runIngestion(deps(world, { owner: "run-2" }));
    const failures = async () => Number((await db.query<{ n: number }>(`SELECT consecutive_failures AS n FROM source_checkpoints WHERE channel_id = $1`, [CHANNEL_B]))[0]!.n);
    expect(await failures()).toBe(2);
    world.feeds[CHANNEL_B] = [];
    await runIngestion(deps(world, { owner: "run-3" }));
    expect(await failures()).toBe(0);
  });

  it("stores a new video only after a successful embed check, and retries one that was inconclusive", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("flaky"), channelId: CHANNEL_A }, { id: testId("gone"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] }, { [testId("flaky")]: "error", [testId("gone")]: "gone" });
    const first = await runIngestion(deps(world));
    expect(first).toMatchObject({ accepted: 2, rejected: 1, failed: 1, updated: 0 });
    expect(await count("videos")).toBe(0);

    world.embed[testId("flaky")] = "ok";
    const second = await runIngestion(deps(world, { owner: "run-2" }));
    expect(second.updated).toBe(1);
    expect(await idsInDb()).toEqual([testId("flaky")]);
  });

  it("reports a partial run, not a success, when embed checks could not be completed", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] }, { [testId("a1")]: "error" });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ status: "partial", failed: 1, failedChannels: [] });
    expect(await count("videos")).toBe(0);
    const [run] = await db.query<{ status: string }>(`SELECT status FROM ingestion_runs`);
    expect(run!.status).toBe("partial");
  });

  it("removes a stored video only when YouTube confirms it is gone, never on an inconclusive check", async () => {
    const old = { schemaVersion: 1 as const, mode: "feed" as const, generatedAt: "2026-11-10T00:00:00.000Z", videos: [
      makeVideo({ youtubeId: testId("gone"), channelId: CHANNEL_A, publishedAt: "2026-11-14T10:00:00.000Z", provenance: { ...makeVideo().provenance, metadataCheckedAt: "2026-11-10T00:00:00.000Z" } }),
      makeVideo({ youtubeId: testId("flaky"), channelId: CHANNEL_A, publishedAt: "2026-11-14T09:00:00.000Z", provenance: { ...makeVideo().provenance, metadataCheckedAt: "2026-11-10T00:00:00.000Z" } }),
      makeVideo({ youtubeId: testId("fine"), channelId: CHANNEL_A, publishedAt: "2026-11-14T08:00:00.000Z", provenance: { ...makeVideo().provenance, metadataCheckedAt: "2026-11-10T00:00:00.000Z" } }),
    ] };
    await importCatalog(db, old);
    const world = newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] }, { [testId("gone")]: "gone", [testId("flaky")]: "error" });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ removed: 1, published: true });
    expect(await idsInDb()).toEqual([testId("fine"), testId("flaky")].sort());
    const [fine] = await db.query<{ metadata_checked_at: string }>(`SELECT metadata_checked_at FROM videos WHERE youtube_id = $1`, [testId("fine")]);
    expect(new Date(fine!.metadata_checked_at).toISOString()).toBe(NOW.toISOString());
  });

  it("removes nothing when most of a batch comes back unavailable at once: that is a block or an outage, not takedowns", async () => {
    const stale = "2026-11-10T00:00:00.000Z";
    const videos = ["v1", "v2", "v3", "v4", "v5", "v6"].map((name, i) => makeVideo({ youtubeId: testId(name), channelId: CHANNEL_A, publishedAt: `2026-11-14T0${i}:00:00.000Z`, provenance: { ...makeVideo().provenance, metadataCheckedAt: stale } }));
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: stale, videos });
    const everythingGone = Object.fromEntries(videos.map((video) => [video.youtubeId, "gone" as const]));
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] }, everythingGone)));
    expect(summary.removed).toBe(0);
    expect(summary.failed).toBe(6);
    expect(summary.message).toMatch(/more likely a block or an outage/);
    expect(await count("videos")).toBe(6);
  });

  it("still removes a few real takedowns when most of the batch is fine", async () => {
    const stale = "2026-11-10T00:00:00.000Z";
    const names = ["k1", "k2", "k3", "k4", "k5", "k6"];
    const videos = names.map((name, i) => makeVideo({ youtubeId: testId(name), channelId: CHANNEL_A, publishedAt: `2026-11-14T0${i}:00:00.000Z`, provenance: { ...makeVideo().provenance, metadataCheckedAt: stale } }));
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: stale, videos });
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] }, { [testId("k1")]: "gone", [testId("k2")]: "gone" })));
    expect(summary.removed).toBe(2);
    expect(await count("videos")).toBe(4);
  });

  it("still enforces retention when a stored row is unreadable, and carries on instead of failing every run", async () => {
    const old = makeVideo({ youtubeId: testId("expired"), channelId: CHANNEL_A, publishedAt: "2026-09-01T00:00:00.000Z" });
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-10T00:00:00.000Z", videos: [old, makeVideo({ youtubeId: testId("healthy"), channelId: CHANNEL_A, publishedAt: "2026-11-14T10:00:00.000Z", provenance: { ...makeVideo().provenance, metadataCheckedAt: "2026-11-10T00:00:00.000Z" } })] });
    // A row from some older shape of the data: it no longer parses.
    await db.query(`UPDATE videos SET data = '{"youtubeId":"x"}'::jsonb WHERE youtube_id = $1`, [testId("healthy")]);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("healthy"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary.status).not.toBe("failed");
    expect(summary.message).toMatch(/does not match the schema/);
    expect(await idsInDb()).toEqual([testId("healthy")]);
    expect(summary).toMatchObject({ removed: 1, published: true });
  });

  it("enforces retention even when every source is down", async () => {
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-10T00:00:00.000Z", videos: [makeVideo({ youtubeId: testId("expired"), channelId: CHANNEL_A, publishedAt: "2026-09-01T00:00:00.000Z" })] });
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: "down", [CHANNEL_B]: "down", [CHANNEL_C]: "down" })));
    expect(summary.status).toBe("failed");
    expect(await count("videos")).toBe(0);
    expect(summary.removed).toBe(1);
  });

  it("ages out videos past retention", async () => {
    await importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-10T00:00:00.000Z", videos: [makeVideo({ youtubeId: testId("ancient"), channelId: CHANNEL_A, publishedAt: "2026-09-01T00:00:00.000Z" })] });
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] })));
    expect(summary.removed).toBeGreaterThanOrEqual(1);
    expect(await count("videos")).toBe(0);
  });

  it("polls the channels attempted longest ago first when limited, so every channel gets its turn", async () => {
    const world = newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const polled = () => [...new Set(world.requests.map((r) => /UULF(.{22})/.exec(r)?.[1]).filter(Boolean))];
    await runIngestion(deps(world, { options: { retry: noRetry, maxChannelsPerRun: 2 } }));
    const firstRound = polled();
    expect(firstRound).toHaveLength(2);
    world.requests.length = 0;
    await runIngestion(deps(world, { owner: "run-2", options: { retry: noRetry, maxChannelsPerRun: 2 } }));
    // The channel left out in round one must be in round two.
    const left = [CHANNEL_A, CHANNEL_B, CHANNEL_C].map((c) => c.slice(2)).find((c) => !firstRound.includes(c))!;
    expect(polled()).toContain(left);
  });
});

describe("bookkeeping retention", () => {
  it("trims old runs at once, and an old version once a newer one exists, never the newest or the run's own row", async () => {
    await db.query(`INSERT INTO ingestion_runs (owner, status, started_at) VALUES ('old', 'failed', now() - interval '90 days'), ('old', 'failed', now() - interval '80 days')`);
    await db.query(`INSERT INTO catalog_versions (mode, video_count, published_at) VALUES ('feed', 1, now() - interval '90 days')`);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const real = { now: () => new Date() };

    // Retention runs first, so during this run the old version is still the newest and must stay.
    const first = await runIngestion(deps(world, real));
    expect(first.status).toBe("succeeded");
    expect(await count("ingestion_runs")).toBe(1);
    expect(await count("catalog_versions")).toBe(2);

    // Now a newer version exists, so the old one is superseded and goes; the newest and the latest run stay.
    const second = await runIngestion(deps(world, { ...real, owner: "run-2" }));
    expect(await count("catalog_versions")).toBe(1);
    expect((await db.query<{ version: string }>(`SELECT version FROM catalog_versions`)).map((row) => Number(row.version))).toEqual([first.version]);
    expect((await db.query<{ run_id: string }>(`SELECT run_id FROM ingestion_runs ORDER BY run_id`)).map((row) => Number(row.run_id))).toEqual([first.runId, second.runId]);
  });
});

describe("withdrawing videos that should no longer be shown", () => {
  const stale = "2026-11-15T00:00:00.000Z";
  const stored = (name: string, channelId: string, hours: number) => makeVideo({ youtubeId: testId(name), channelId, publishedAt: `2026-11-15T0${hours}:00:00.000Z`, provenance: { ...makeVideo().provenance, metadataCheckedAt: stale } });
  const seed = (videos: ReturnType<typeof stored>[]) => importCatalog(db, { schemaVersion: 1, mode: "feed", generatedAt: stale, videos });
  const excluding = (...ids: string[]) => parseOverrides({ schemaVersion: 1, include: [], exclude: ids.map((id) => ({ youtubeId: id, note: "taken down by an editor" })) });

  it("removes a stored video that an editor has since excluded, when its feed shows it again", async () => {
    await seed([stored("bad", CHANNEL_A, 1), stored("keep", CHANNEL_A, 2)]);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("bad"), channelId: CHANNEL_A, published: "2026-11-15T01:00:00+00:00" }, { id: testId("keep"), channelId: CHANNEL_A, published: "2026-11-15T02:00:00+00:00" }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world, { overrides: excluding(testId("bad")) }));
    expect(summary).toMatchObject({ removed: 1, published: true });
    expect(await idsInDb()).toEqual([testId("keep")]);
  });

  it("removes stored videos of a channel that is no longer approved, which is never polled again", async () => {
    const GONE = "UC" + "Z".repeat(22);
    await seed([stored("gone1", GONE, 1), stored("fine1", CHANNEL_A, 2), stored("fine2", CHANNEL_A, 3)]);
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] })));
    expect(summary.removed).toBe(1);
    expect(await idsInDb()).toEqual([testId("fine1"), testId("fine2")].sort());
  });

  it("does not delete on a title-rule rejection: a keyless feed cannot tell what the API knew", async () => {
    await seed([stored("odd", CHANNEL_A, 1)]);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("odd"), channelId: CHANNEL_A, title: "Behind the scenes with the mascot", published: "2026-11-15T01:00:00+00:00" }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary.rejected).toBe(1);
    expect(summary.removed).toBe(0);
    expect(await idsInDb()).toEqual([testId("odd")]);
  });

  it("removes nothing when no channel is approved: that is a broken configuration, not a decision", async () => {
    await seed([stored("a", CHANNEL_A, 1), stored("b", CHANNEL_B, 2)]);
    const summary = await runIngestion(deps(newWorld({}), { sources: [] }));
    expect(summary.removed).toBe(0);
    expect(await count("videos")).toBe(2);
  });

  it("removes nothing when most of the catalog would go at once, and says why", async () => {
    const GONE = "UC" + "Y".repeat(22);
    await seed([stored("g1", GONE, 1), stored("g2", GONE, 2), stored("g3", GONE, 3), stored("f1", CHANNEL_A, 4)]);
    const summary = await runIngestion(deps(newWorld({ [CHANNEL_A]: [], [CHANNEL_B]: [], [CHANNEL_C]: [] })));
    expect(summary.removed).toBe(0);
    expect(summary.message).toMatch(/configuration mistake/);
    expect(await count("videos")).toBe(4);
  });
});

describe("recovering uploads that fell off the feed", () => {
  const CHECKPOINT = "2026-11-10T00:00:00.000Z";

  /** A channel that has been seen before, and a feed whose every entry is newer than that, so uploads may have been missed. */
  async function seenBefore() {
    await db.query(`INSERT INTO source_checkpoints (channel_id, last_attempt_at, last_success_at, newest_seen_at) VALUES ($1, $2, $2, $2)`, [CHANNEL_A, CHECKPOINT]);
    return newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A, published: "2026-11-15T10:00:00+00:00" }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
  }
  const brokenApi = { unitsUsed: 0, getChannels: async () => { throw new Error("quota exceeded"); }, listPlaylistVideoIds: async () => [], getVideos: async () => [] } as unknown as NonNullable<IngestionDeps["api"]>;

  it("keeps the channel's checkpoint where it was when recovery fails, so the next run tries again", async () => {
    const world = await seenBefore();
    const summary = await runIngestion(deps(world, { api: brokenApi }));
    // The video the feed did offer is still stored.
    expect(await idsInDb()).toEqual([testId("a1")]);
    expect(summary.failedChannels).toEqual([expect.objectContaining({ channelId: CHANNEL_A, message: expect.stringMatching(/Recovering missed uploads failed.*quota exceeded/) })]);
    expect(summary.status).toBe("partial");
    const [row] = await db.query<{ newest_seen_at: string; consecutive_failures: number }>(`SELECT newest_seen_at, consecutive_failures FROM source_checkpoints WHERE channel_id = $1`, [CHANNEL_A]);
    expect(new Date(row!.newest_seen_at).toISOString()).toBe(CHECKPOINT);
    expect(row!.consecutive_failures).toBe(1);
  });

  it("advances the checkpoint once recovery works", async () => {
    const world = await seenBefore();
    const workingApi = { unitsUsed: 0, getChannels: async () => new Map([[CHANNEL_A, { uploadsPlaylistId: "UU" }]]), listPlaylistVideoIds: async () => [], getVideos: async () => [] } as unknown as NonNullable<IngestionDeps["api"]>;
    const summary = await runIngestion(deps(world, { api: workingApi }));
    expect(summary.status).toBe("succeeded");
    const [row] = await db.query<{ newest_seen_at: string }>(`SELECT newest_seen_at FROM source_checkpoints WHERE channel_id = $1`, [CHANNEL_A]);
    expect(new Date(row!.newest_seen_at).toISOString()).toBe("2026-11-15T10:00:00.000Z");
  });
});

describe("repeated runs over time", () => {
  const later = (hours: number) => () => new Date(NOW.getTime() + hours * 3_600_000);

  it("changes nothing and mints no version when the same feeds are seen again hours later", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }, { id: testId("a2"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    await runIngestion(deps(world));
    const again = await runIngestion(deps(world, { owner: "run-2", now: later(3) }));
    expect(again).toMatchObject({ updated: 0, removed: 0, published: false, version: 1 });
    expect(await count("catalog_versions")).toBe(1);
  });

  it("never stores a video that is already past retention, so it cannot churn versions", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("old"), channelId: CHANNEL_A, published: "2026-09-01T10:00:00+00:00" }, { id: testId("new"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const first = await runIngestion(deps(world));
    expect(first).toMatchObject({ discovered: 1, updated: 1, removed: 0 });
    expect(await idsInDb()).toEqual([testId("new")]);
    const second = await runIngestion(deps(world, { owner: "run-2", now: later(1) }));
    expect(second).toMatchObject({ updated: 0, removed: 0, published: false, version: 1 });
  });

  it("keeps what the feed cannot know when a stored video is seen again, and updates only what changed", async () => {
    const id = testId("enriched");
    const world = newWorld({ [CHANNEL_A]: [{ id, channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    await runIngestion(deps(world));
    // Pretend an earlier API-enabled run added what a feed cannot know.
    await pg.exec(`UPDATE videos SET data = jsonb_set(jsonb_set(jsonb_set(data, '{durationSeconds}', '754'), '{provenance,discoveryMethod}', '"data-api"'), '{provenance,metadataCheckedAt}', '"2026-11-16T11:00:00.000Z"')`);
    const unchanged = await runIngestion(deps(world, { owner: "run-1b", now: later(1) }));
    expect(unchanged).toMatchObject({ updated: 0, published: false });

    world.feeds[CHANNEL_A] = [{ id, channelId: CHANNEL_A, title: "Player Name Game Highlights | November 15, 2026 (Extended)" }];
    const renamed = await runIngestion(deps(world, { owner: "run-2", now: later(2) }));
    expect(renamed).toMatchObject({ updated: 1, published: true });
    const [row] = await db.query<{ data: { title: string; durationSeconds: number; embeddable: boolean; provenance: { discoveryMethod: string; metadataCheckedAt: string } } }>(`SELECT data FROM videos WHERE youtube_id = $1`, [id]);
    expect(row!.data).toMatchObject({ title: expect.stringContaining("Extended"), durationSeconds: 754, embeddable: true });
    expect(row!.data.provenance).toMatchObject({ discoveryMethod: "data-api", metadataCheckedAt: "2026-11-16T11:00:00.000Z" });
  });
});

describe("leases and concurrency", () => {
  it("skips, without touching anything, when another run holds the lease", async () => {
    await acquireLease(db, "ingestion", "someone-else", 60);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const summary = await runIngestion(deps(world));
    expect(summary).toMatchObject({ status: "skipped", runId: null });
    expect(world.requests).toHaveLength(0);
    expect(await count("videos")).toBe(0);
    expect(await count("ingestion_runs")).toBe(0);
  });

  it("runs once when started twice at the same moment, and loses nothing", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }, { id: testId("a2"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const [first, second] = await Promise.all([runIngestion(deps(world, { owner: "run-1" })), runIngestion(deps(world, { owner: "run-2" }))]);
    expect([first.status, second.status].sort()).toEqual(["skipped", "succeeded"]);
    expect(await count("videos")).toBe(2);
    expect(await count("catalog_versions")).toBe(1);
  });

  it("takes over a lease that expired, and releases its own when done", async () => {
    await acquireLease(db, "ingestion", "crashed-run", 60);
    await pg.exec(`UPDATE leases SET expires_at = now() - interval '1 minute'`);
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    expect((await runIngestion(deps(world))).status).toBe("succeeded");
    expect(await count("leases")).toBe(0);
  });

  it("writes nothing if it lost its lease while working", async () => {
    const world = newWorld({ [CHANNEL_A]: [{ id: testId("a1"), channelId: CHANNEL_A }], [CHANNEL_B]: [], [CHANNEL_C]: [] });
    const slow: IngestionDeps = deps(world);
    const realFetch = slow.fetch;
    // Another owner takes the lease while this run is waiting on YouTube.
    slow.fetch = async (url, init) => {
      await pg.exec(`UPDATE leases SET owner = 'usurper', expires_at = now() + interval '1 minute' WHERE name = 'ingestion'`);
      return realFetch(url, init);
    };
    const summary = await runIngestion(slow);
    expect(summary.status).toBe("failed");
    expect(summary.message).toMatch(/lease/);
    expect(await count("videos")).toBe(0);
    expect(await count("source_checkpoints")).toBe(0);
  });
});
