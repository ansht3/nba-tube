import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import { withinStorageLimit } from "./load";
import type { Catalog } from "./schema";

const NOW = new Date("2026-12-20T00:00:00Z");

function catalog(mode: Catalog["mode"]): Catalog {
  const checked = (iso: string, name: string) => makeVideo({ youtubeId: testId(name), provenance: { ...makeVideo().provenance, metadataCheckedAt: iso } });
  return { schemaVersion: 1, mode, generatedAt: "2026-11-11T00:00:00Z", videos: [checked("2026-12-01T00:00:00Z", "fresh"), checked("2026-11-11T00:00:00Z", "stale")] };
}

describe("withinStorageLimit", () => {
  it("removes API records checked more than 30 days ago", () => {
    expect(withinStorageLimit(catalog("api"), NOW).videos.map((video) => video.youtubeId)).toEqual([testId("fresh")]);
  });

  it("leaves feed and seed catalogs alone", () => {
    expect(withinStorageLimit(catalog("feed"), NOW).videos).toHaveLength(2);
    expect(withinStorageLimit(catalog("seed"), NOW).videos).toHaveLength(2);
  });
});

describe("loadCatalog, loadSyncStatus and loadSources against a data directory", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "nbatube-load-"));
    mkdirSync(path.join(root, "data", "seed"), { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.resetModules(); // the module reads its paths once, when it is first imported
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const write = (file: string, value: unknown, mtimeSeconds?: number) => {
    const full = path.join(root, "data", file);
    writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value));
    if (mtimeSeconds !== undefined) utimesSync(full, mtimeSeconds, mtimeSeconds);
  };
  const withVideos = (mode: Catalog["mode"], ...names: string[]): Catalog => ({ schemaVersion: 1, mode, generatedAt: "2026-11-20T00:00:00.000Z", videos: names.map((name) => makeVideo({ youtubeId: testId(name) })) });
  const load = async () => (await import("./load")).loadCatalog();
  const ids = (c: Catalog) => c.videos.map((video) => video.youtubeId);

  it("uses the synced catalog when it has videos, and ignores the seed", async () => {
    write("catalog.json", withVideos("feed", "synced1", "synced2"));
    write("seed/catalog.json", withVideos("seed", "seeded"));
    expect(ids(await load())).toEqual([testId("synced1"), testId("synced2")]);
  });

  it("falls back to the seed when a sync left the catalog empty, so a bad sync cannot blank the site", async () => {
    write("catalog.json", withVideos("feed"));
    write("seed/catalog.json", withVideos("seed", "seeded"));
    expect(ids(await load())).toEqual([testId("seeded")]);
  });

  it("serves an empty catalog when it is all there is, rather than failing", async () => {
    write("catalog.json", withVideos("feed"));
    expect((await load()).videos).toEqual([]);
  });

  it("uses the seed when nothing has been synced", async () => {
    write("seed/catalog.json", withVideos("seed", "seeded"));
    expect(ids(await load())).toEqual([testId("seeded")]);
  });

  it("fails with instructions when there is no catalog at all", async () => {
    await expect(load()).rejects.toThrow(/No catalog found. Run "npm run sync"/);
  });

  it("fails loudly on a synced catalog that is not valid, naming the problem, instead of quietly serving the smaller seed", async () => {
    write("catalog.json", { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-20T00:00:00.000Z", videos: [{ youtubeId: "short" }] });
    write("seed/catalog.json", withVideos("seed", "seeded"));
    await expect(load()).rejects.toThrow(/data[\\/]catalog\.json is not a valid catalog \(videos\.0\.\w+:.*Run "npm run sync"/);
  });

  it("reads again when the file changes, and reuses the parsed catalog while it does not", async () => {
    const { loadCatalog } = await import("./load");
    write("catalog.json", withVideos("feed", "first"), 1_700_000_000);
    const first = loadCatalog();
    expect(loadCatalog()).toBe(first);
    write("catalog.json", withVideos("feed", "second"), 1_700_000_100);
    expect(ids(loadCatalog())).toEqual([testId("second")]);
  });

  it("drops API records past the 30-day limit when it loads, whatever the sync did", async () => {
    const old = makeVideo({ youtubeId: testId("old"), provenance: { ...makeVideo().provenance, metadataCheckedAt: "2020-01-01T00:00:00.000Z" } });
    const fresh = makeVideo({ youtubeId: testId("fresh"), provenance: { ...makeVideo().provenance, metadataCheckedAt: new Date().toISOString() } });
    write("catalog.json", { schemaVersion: 1, mode: "api", generatedAt: new Date().toISOString(), videos: [old, fresh] });
    expect(ids(await load())).toEqual([testId("fresh")]);
  });

  it("reports the last sync, and null when there is none or the file is unusable", async () => {
    const { loadSyncStatus } = await import("./load");
    expect(loadSyncStatus()).toBeNull();
    write("sync-status.json", { ok: true, finishedAt: "2026-11-20T00:00:00.000Z", mode: "feed", usedFallback: "none", sourceErrors: 0, error: null });
    expect(loadSyncStatus()).toMatchObject({ ok: true, mode: "feed" });
    write("sync-status.json", "{ not json");
    expect(loadSyncStatus()).toBeNull();
    write("sync-status.json", { ok: "yes" });
    expect(loadSyncStatus()).toBeNull();
  });

  it("reads the channel registry", async () => {
    write("sources.json", JSON.parse((await import("node:fs")).readFileSync(path.join(__dirname, "../../data/sources.json"), "utf8")));
    const { loadSources } = await import("./load");
    expect(loadSources().sources.length).toBeGreaterThan(20);
  });
});
