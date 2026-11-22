import { compareVideos } from "@/catalog/repository";
import { bestKey } from "@/catalog/rank";
import { expect, test } from "@playwright/test";
import { builtCatalog } from "./fixtures";

// The API is the same for every viewport, so these run once, on the real `next start` server.
test.skip(({ isMobile }) => isMobile, "API behaviour does not depend on the viewport");

interface Page {
  videos: { youtubeId: string; title: string; publishedAt: string; labels: { teamIds: string[]; contentType: string } }[];
  total: number;
  nextCursor: string | null;
  version: string;
}

const newestFirst = () => [...builtCatalog()].sort((a, b) => compareVideos(a as never, b as never));

test("lists the newest 24 videos in catalog order with cache headers, an ETag and security headers", async ({ request }) => {
  const response = await request.get("/api/videos");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as Page;
  expect(body.videos).toHaveLength(24);
  expect(body.total).toBe(builtCatalog().length);
  expect(body.videos.map((v) => v.youtubeId)).toEqual(newestFirst().slice(0, 24).map((v) => v.youtubeId));
  expect(response.headers()["cache-control"]).toContain("s-maxage=30");
  expect(response.headers()["etag"]).toMatch(/^W\//);
  expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("paging with the cursor visits every video exactly once", async ({ request }) => {
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const response = await request.get(`/api/videos?limit=48${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as Page;
    seen.push(...body.videos.map((v) => v.youtubeId));
    cursor = body.nextCursor;
    pages++;
  } while (cursor && pages < 100);
  expect(seen).toEqual(newestFirst().map((v) => v.youtubeId));
  expect(new Set(seen).size).toBe(seen.length);
});

test("filters by team, section and search, and counts what matches", async ({ request }) => {
  const catalog = builtCatalog();
  const team = catalog.find((v) => v.labels.teamIds.length > 0)!.labels.teamIds[0]!;
  const byTeam = (await (await request.get(`/api/videos?team=${team}&limit=48`)).json()) as Page;
  expect(byTeam.total).toBe(catalog.filter((v) => v.labels.teamIds.includes(team)).length);
  expect(byTeam.videos.every((v) => v.labels.teamIds.includes(team))).toBe(true);

  const word = catalog[0]!.title.split(/\s+/).find((w) => /^[A-Za-z]{5,}$/.test(w))!;
  const search = (await (await request.get(`/api/videos?q=${encodeURIComponent(word.toUpperCase())}&limit=48`)).json()) as Page;
  expect(search.total).toBeGreaterThan(0);
  expect(search.videos.map((v) => v.youtubeId)).toContain(catalog[0]!.youtubeId);

  expect((await (await request.get("/api/videos?sort=oldest&limit=1")).json() as Page).videos[0]!.youtubeId).toBe(newestFirst().at(-1)!.youtubeId);
});

test("sorts best first and looks up a list of ids", async ({ request }) => {
  // Walk the whole catalog in best-first order: every video exactly once, and the stable score key never increases.
  const seen: Page["videos"] = [];
  let cursor: string | null = null;
  do {
    const page = (await (await request.get(`/api/videos?sort=best&limit=48${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)).json()) as Page;
    seen.push(...page.videos);
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen.map((v) => v.youtubeId).sort()).toEqual(builtCatalog().map((v) => v.youtubeId).sort());
  const keys = seen.map((v) => bestKey(v as never));
  for (let i = 1; i < keys.length; i++) expect(keys[i]!, `position ${i}`).toBeLessThanOrEqual(keys[i - 1]!);

  const wanted = newestFirst().slice(0, 3).map((v) => v.youtubeId);
  const found = (await (await request.get(`/api/videos?ids=${wanted.join(",")},aaaaaaaaaaa`)).json()) as Page;
  expect(found.videos.map((v) => v.youtubeId)).toEqual(wanted);
  expect(found.total).toBe(3);
});

test("a repeat request with the ETag gets 304 and an empty body", async ({ request }) => {
  const first = await request.get("/api/videos?section=highlights");
  const etag = first.headers()["etag"]!;
  const second = await request.get("/api/videos?section=highlights", { headers: { "If-None-Match": etag } });
  expect(second.status()).toBe(304);
  expect(await second.text()).toBe("");
});

test("rejects bad requests with a JSON 400 that is not cached", async ({ request }) => {
  for (const path of ["/api/videos?limit=999", "/api/videos?nope=1", "/api/videos?cursor=garbage", "/api/videos?team=ZZZ"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(400);
    expect(response.headers()["cache-control"], path).toBe("no-store");
    expect(((await response.json()) as { error: string }).error).toBeTruthy();
  }
});

test("returns one video by id, and 404 or 400 for ids that cannot exist", async ({ request }) => {
  const [first] = builtCatalog();
  const response = await request.get(`/api/videos/${first!.youtubeId}`);
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { video: { youtubeId: string } }).video.youtubeId).toBe(first!.youtubeId);
  expect((await request.get("/api/videos/aaaaaaaaaaa")).status()).toBe(404);
  expect((await request.get("/api/videos/short")).status()).toBe(400);
});

test("/api/version is tiny and names the newest video", async ({ request }) => {
  const response = await request.get("/api/version");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text.length).toBeLessThan(250);
  const body = JSON.parse(text) as { version: string; newestId: string; total: number };
  expect(body.newestId).toBe(newestFirst()[0]!.youtubeId);
  expect(body.total).toBe(builtCatalog().length);
  expect((await request.get("/api/version", { headers: { "If-None-Match": response.headers()["etag"]! } })).status()).toBe(304);
});

test("/api/updates returns exactly the videos newer than the one the client has", async ({ request }) => {
  const sorted = newestFirst();
  const none = (await (await request.get(`/api/updates?since=${sorted[0]!.youtubeId}`)).json()) as { count: number; videos: unknown[]; reset: boolean };
  expect(none).toMatchObject({ count: 0, videos: [], reset: false });

  const three = (await (await request.get(`/api/updates?since=${sorted[3]!.youtubeId}`)).json()) as { count: number; videos: { youtubeId: string }[]; hasMore: boolean };
  expect(three.count).toBe(3);
  expect(three.hasMore).toBe(false);
  expect(three.videos.map((v) => v.youtubeId)).toEqual(sorted.slice(0, 3).map((v) => v.youtubeId));

  expect(((await (await request.get("/api/updates?since=gone_______")).json()) as { reset: boolean }).reset).toBe(true);
  expect((await request.get("/api/updates")).status()).toBe(400);
});

test("/api/health reports the file catalog as ok and never caches", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toMatchObject({ status: "ok", mode: "file", worker: { state: "unknown" } });
});
