import { describe, expect, it, vi } from "vitest";
import type { Catalog } from "@/catalog/schema";
import { makeVideo, testId } from "@/test/fixtures";
import { planFailure, readPreviousCatalog } from "./previous";

const catalog = (mode: Catalog["mode"]): Catalog => ({ schemaVersion: 1, mode, generatedAt: "2026-11-16T10:00:00.000Z", videos: [makeVideo({ youtubeId: testId("a") })] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const base = () => ({ warn: vi.fn(), fetch: vi.fn(), url: "https://site.example/catalog.json", local: () => undefined as unknown });

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

  it("starts fresh, with a warning, when the site is down or returns an error", async () => {
    const down = base(); down.fetch.mockRejectedValue(new Error("connection refused"));
    expect(await readPreviousCatalog(down)).toBeNull();
    const broken = base(); broken.fetch.mockResolvedValue(json({}, 500));
    expect(await readPreviousCatalog(broken)).toBeNull();
    expect(down.warn).toHaveBeenCalledOnce(); expect(broken.warn).toHaveBeenCalledOnce();
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
