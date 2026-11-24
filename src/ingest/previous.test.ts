import { describe, expect, it, vi } from "vitest";
import type { Catalog } from "@/catalog/schema";
import { makeVideo, testId } from "@/test/fixtures";
import { planFailure, readPreviousCatalog } from "./previous";

const catalog = (mode: Catalog["mode"]): Catalog => ({ schemaVersion: 1, mode, generatedAt: "2026-11-16T10:00:00.000Z", videos: [makeVideo({ youtubeId: testId("a") })] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const base = () => ({ warn: vi.fn(), fetch: vi.fn(), url: "https://site.example/catalog.json", local: () => undefined as unknown, sleep: async () => {} });

describe("readPreviousCatalog", () => {
  it("uses the local catalog and does not download anything", async () => {
    const s = { ...base(), local: () => catalog("feed") };
    expect((await readPreviousCatalog(s))?.videos).toHaveLength(1);
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("rebuilds from scratch, with a warning, when the local file is invalid", async () => {
    const s = { ...base(), local: () => ({ nope: true }) };
    expect(await readPreviousCatalog(s)).toBeNull();
    expect(s.warn).toHaveBeenCalledOnce();
  });

  it("continues from the published catalog when there is no local file", async () => {
    const s = base(); s.fetch.mockResolvedValue(json(catalog("feed")));
    expect((await readPreviousCatalog(s))?.mode).toBe("feed");
    expect(s.fetch).toHaveBeenCalledWith("https://site.example/catalog.json", expect.anything());
  });

  it("never carries a seed forward", async () => {
    const s = base(); s.fetch.mockResolvedValue(json(catalog("seed")));
    expect(await readPreviousCatalog(s)).toBeNull();
  });

  it("retries a busy or unreachable site and carries on from the catalog once it answers", async () => {
    const busy = base(); busy.fetch.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(catalog("feed")));
    expect((await readPreviousCatalog(busy))?.mode).toBe("feed");
    expect(busy.fetch).toHaveBeenCalledTimes(2);
    expect(busy.warn).not.toHaveBeenCalled();

    const dropped = base(); dropped.fetch.mockRejectedValueOnce(new Error("connection reset")).mockRejectedValueOnce(new Error("connection reset")).mockResolvedValueOnce(json(catalog("feed")));
    expect((await readPreviousCatalog(dropped))?.videos).toHaveLength(1);
    expect(dropped.fetch).toHaveBeenCalledTimes(3);
  });

  it("starts fresh and says what that costs when the site stays down, returns an error, or answers with something that is not a catalog", async () => {
    const down = base(); down.fetch.mockRejectedValue(new Error("connection refused"));
    const broken = base(); broken.fetch.mockResolvedValue(json({}, 500));
    const garbage = base(); garbage.fetch.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 200 }));
    const wrongShape = base(); wrongShape.fetch.mockResolvedValue(json({ videos: "none" }));
    for (const s of [down, broken, garbage, wrongShape]) {
      expect(await readPreviousCatalog(s)).toBeNull();
      expect(s.warn).toHaveBeenCalledOnce();
      expect(s.warn.mock.calls[0]![0]).toMatch(/fewer videos than the live site/);
    }
    expect(down.fetch).toHaveBeenCalledTimes(3); // the first try and two retries
    expect(broken.fetch).toHaveBeenCalledTimes(3);
    expect(wrongShape.fetch).toHaveBeenCalledTimes(1); // a bad answer is not a busy server: no retry
  });

  it("treats a 404 as a first deploy: no retries, and no alarm about lost videos", async () => {
    const s = base(); s.fetch.mockResolvedValue(json({}, 404));
    expect(await readPreviousCatalog(s)).toBeNull();
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.warn).toHaveBeenCalledOnce();
    expect(s.warn.mock.calls[0]![0]).toMatch(/first deploy/);
    expect(s.warn.mock.calls[0]![0]).not.toMatch(/fewer videos/);
  });

  it("has nothing to continue from without a URL", async () => {
    const s = { ...base(), url: null };
    expect(await readPreviousCatalog(s)).toBeNull();
    expect(s.fetch).not.toHaveBeenCalled();
  });
});

describe("planFailure", () => {
  it("writes the published catalog back on a clean build so it is published instead of the seed", () => {
    expect(planFailure(catalog("feed"), false)).toEqual({ writePrevious: true, fallback: "previous-catalog" });
  });
  it("leaves an existing local catalog alone", () => {
    expect(planFailure(catalog("feed"), true)).toEqual({ writePrevious: false, fallback: "previous-catalog" });
  });
  it("falls back to the seed only when there is nothing to keep", () => {
    expect(planFailure(null, false)).toEqual({ writePrevious: false, fallback: "seed" });
  });
});
