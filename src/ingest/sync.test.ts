import { describe, expect, it, vi } from "vitest";
import { catalogSchema, type Catalog } from "@/catalog/schema";
import type { Source } from "@/catalog/sources";
import { makeCandidate, makeSource, testId } from "@/test/fixtures";
import type { CandidateVideo } from "./candidate";
import { NO_OVERRIDES, type Overrides } from "./overrides";
import { runSync } from "./sync";
import { YouTubeApiError, type YouTubeApi } from "./youtube/api";
import type { EmbedCheck } from "./youtube/oembed";

const NOW = new Date("2026-11-11T18:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const NBA = "UCWJ2lWNubArHWmf3FIHbfcQ";
const HAWKS = "UCpfcwELvR1wtcRJ0UxNXHYw";
const league = makeSource();
const hawks = makeSource({ channelId: HAWKS, name: "Atlanta Hawks", handle: "@ATLHawks", publisherType: "team", teamId: "ATL" });
const sources = [league, hawks];

function highlight(name: string, overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  return makeCandidate({ youtubeId: testId(name), discoveryMethod: "data-api", embeddable: true, durationSeconds: 600, ...overrides });
}

function presser(name: string, overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  return highlight(name, {
    title: "Hawks vs. Lakers Postgame Press Conference: Dyson Daniels",
    channelId: HAWKS,
    channelTitle: "Atlanta Hawks",
    ...overrides,
  });
}

interface FakeApiConfig {
  /** Video ids in each channel's uploads playlist. */
  uploads: Record<string, string[]>;
  /** Every video YouTube would return details for. */
  videos: CandidateVideo[];
  failPlaylist?: Record<string, Error>;
  failVideos?: Error;
  failChannels?: Error;
}

function fakeApi(config: FakeApiConfig): YouTubeApi {
  let unitsUsed = 0;
  return {
    get unitsUsed() {
      return unitsUsed;
    },
    async getChannels(channelIds) {
      unitsUsed++;
      if (config.failChannels) throw config.failChannels;
      const known = channelIds.filter((id) => id in config.uploads);
      return new Map(known.map((id) => [id, { title: id, uploadsPlaylistId: `UU${id.slice(2)}` }]));
    },
    async listPlaylistVideoIds(playlistId, limit) {
      unitsUsed++;
      const channelId = `UC${playlistId.slice(2)}`;
      if (config.failPlaylist?.[channelId]) throw config.failPlaylist[channelId];
      return config.uploads[channelId].slice(0, limit);
    },
    async getVideos(ids) {
      unitsUsed++;
      if (config.failVideos) throw config.failVideos;
      return config.videos.filter((video) => ids.includes(video.youtubeId));
    },
  };
}

function apiSync(config: FakeApiConfig, previous: Catalog | null = null, extra: { overrides?: Overrides; now?: Date; sources?: Source[]; limits?: object } = {}) {
  return runSync({
    mode: "api",
    api: fakeApi(config),
    sources: extra.sources ?? sources,
    previous,
    overrides: extra.overrides ?? NO_OVERRIDES,
    now: extra.now ?? NOW,
    limits: extra.limits,
  });
}

function ids(catalog: Catalog) {
  return catalog.videos.map((video) => video.youtubeId);
}

describe("runSync with the Data API", () => {
  const game = highlight("game");
  const talk = presser("talk", { publishedAt: "2026-11-10T04:00:00+00:00" });
  const config: FakeApiConfig = { uploads: { [NBA]: [game.youtubeId], [HAWKS]: [talk.youtubeId] }, videos: [game, talk] };

  it("builds a valid catalog, newest first", async () => {
    const { catalog, report } = await apiSync(config);
    expect(() => catalogSchema.parse(catalog)).not.toThrow();
    expect(catalog.mode).toBe("api");
    expect(ids(catalog)).toEqual([game.youtubeId, talk.youtubeId]);
    expect(report).toMatchObject({ discovered: 2, total: 2, added: 2, removed: 0, stoppedEarly: null });
    // One channels call, one playlist call per channel, one videos call.
    expect(report.quotaUnitsUsed).toBe(4);
  });

  it("stores a video once even when it is discovered several times", async () => {
    const repeated = { ...config, uploads: { [NBA]: [game.youtubeId, game.youtubeId], [HAWKS]: [talk.youtubeId, game.youtubeId] } };
    const { catalog } = await apiSync(repeated);
    expect(ids(catalog)).toEqual([game.youtubeId, talk.youtubeId]);
  });

  it("is idempotent: a second run over the same data changes nothing", async () => {
    const first = await apiSync(config);
    const second = await apiSync(config, first.catalog);
    expect(second.catalog).toEqual(first.catalog);
    expect(second.report).toMatchObject({ added: 0, removed: 0, total: 2 });
  });

  it("rejects what the rules reject and says why", async () => {
    const hype = highlight("hype", { title: "Los Angeles Lakers 2026-27 Season Hype Video" });
    const { catalog, report } = await apiSync({ uploads: { [NBA]: [game.youtubeId, hype.youtubeId], [HAWKS]: [] }, videos: [game, hype] });
    expect(ids(catalog)).toEqual([game.youtubeId]);
    expect(report.rejectedByReason).toEqual({ UNRELATED_CONTENT: 1 });
    expect(report.rejected[0]).toMatchObject({ youtubeId: hype.youtubeId, ruleId: "show-or-feature" });
  });

  it("removes a stored video that YouTube no longer returns", async () => {
    const first = await apiSync(config);
    const deleted = { ...config, videos: [game] };
    const { catalog, report } = await apiSync(deleted, first.catalog);
    expect(ids(catalog)).toEqual([game.youtubeId]);
    expect(report.removed).toBe(1);
  });

  it("removes a stored video that became private or unembeddable", async () => {
    const first = await apiSync(config);
    for (const change of [{ privacyStatus: "private" as const }, { embeddable: false }]) {
      const { catalog, report } = await apiSync({ ...config, videos: [game, { ...talk, ...change }] }, first.catalog);
      expect(ids(catalog)).toEqual([game.youtubeId]);
      expect(report.rejectedByReason).toEqual({ UNAVAILABLE_VIDEO: 1 });
    }
  });

  it("refreshes stored videos that have left the uploads window", async () => {
    const first = await apiSync(config);
    const later = new Date(NOW.getTime() + 5 * DAY);
    // The Hawks video is no longer among the newest uploads, but it still exists.
    const { catalog } = await apiSync({ ...config, uploads: { [NBA]: [game.youtubeId], [HAWKS]: [] } }, first.catalog, { now: later });
    const stored = catalog.videos.find((video) => video.youtubeId === talk.youtubeId);
    expect(stored?.provenance.metadataCheckedAt).toBe(later.toISOString());
  });

  it("drops a stored video whose title no longer qualifies", async () => {
    const first = await apiSync(config);
    const renamed = { ...talk, title: "Dyson Daniels Mic'd Up" };
    const { catalog } = await apiSync({ ...config, videos: [game, renamed] }, first.catalog);
    expect(ids(catalog)).toEqual([game.youtubeId]);
  });

  it("rejects videos from channels outside the registry", async () => {
    const stranger = highlight("stranger", { channelId: "UChdTjGHWrl-scbthhYSGB3g", channelTitle: "HoustonRockets" });
    const overrides: Overrides = { schemaVersion: 1, include: [{ youtubeId: stranger.youtubeId, contentType: "GAME_HIGHLIGHTS", gamePhase: null, note: "try" }], exclude: [] };
    const { catalog, report } = await apiSync({ ...config, videos: [game, talk, stranger] }, null, { overrides });
    expect(ids(catalog)).not.toContain(stranger.youtubeId);
    expect(report.rejectedByReason).toEqual({ UNVERIFIED_PUBLISHER: 1 });
  });

  it("carries on when one channel fails", async () => {
    const failing = { ...config, failPlaylist: { [HAWKS]: new YouTubeApiError("not-found", "playlist not found", 404) } };
    const { catalog, report } = await apiSync(failing);
    expect(ids(catalog)).toEqual([game.youtubeId]);
    expect(report.sourceErrors).toEqual([{ channelId: HAWKS, name: "Atlanta Hawks", message: "playlist not found" }]);
  });

  it("reports a channel that YouTube does not return", async () => {
    const { report } = await apiSync({ uploads: { [NBA]: [game.youtubeId] }, videos: [game] });
    expect(report.sourceErrors).toEqual([{ channelId: HAWKS, name: "Atlanta Hawks", message: "YouTube did not return this channel" }]);
  });

  it("keeps the previous catalog when the quota runs out mid-run", async () => {
    const first = await apiSync(config);
    const quota = new YouTubeApiError("quota-exceeded", "quota used up", 403);

    const duringDiscovery = await apiSync({ ...config, failPlaylist: { [NBA]: quota } }, first.catalog);
    expect(ids(duringDiscovery.catalog)).toEqual(ids(first.catalog));
    expect(duringDiscovery.report.stoppedEarly).toBe("quota used up");

    const duringDetails = await apiSync({ ...config, failVideos: quota }, first.catalog);
    expect(ids(duringDetails.catalog)).toEqual(ids(first.catalog));
    expect(duringDetails.report).toMatchObject({ stoppedEarly: "quota used up", removed: 0 });
  });

  it("fails outright on an invalid key instead of writing an empty catalog", async () => {
    const invalid = new YouTubeApiError("invalid-key", "YouTube rejected the API key.", 400);
    await expect(apiSync({ ...config, failChannels: invalid })).rejects.toThrow(/rejected the API key/);
  });

  it("drops videos past the retention window", async () => {
    const old = highlight("old", { publishedAt: new Date(NOW.getTime() - 46 * DAY).toISOString() });
    const { catalog } = await apiSync({ uploads: { [NBA]: [game.youtubeId, old.youtubeId], [HAWKS]: [] }, videos: [game, old] });
    expect(ids(catalog)).toEqual([game.youtubeId]);
  });

  it("deletes metadata that could not be refreshed for 30 days", async () => {
    const first = await apiSync(config);
    const quota = new YouTubeApiError("quota-exceeded", "quota used up", 403);
    // Nothing can be refreshed, and the stored records are now 31 days stale.
    const later = new Date(NOW.getTime() + 31 * DAY);
    const { catalog } = await apiSync({ ...config, failVideos: quota }, first.catalog, { now: later, limits: { retentionDays: 365 } });
    expect(catalog.videos).toEqual([]);
  });

  it("caps the catalog size and the number of videos per channel", async () => {
    const many = Array.from({ length: 6 }, (_, index) => highlight(`many${index}`, { publishedAt: new Date(NOW.getTime() - index * HOUR).toISOString() }));
    const uploads = { [NBA]: many.map((video) => video.youtubeId), [HAWKS]: [talk.youtubeId] };

    const capped = await apiSync({ uploads, videos: [...many, talk] }, null, { limits: { maxVideos: 3 } });
    expect(ids(capped.catalog)).toEqual(many.slice(0, 3).map((video) => video.youtubeId));

    const perSource = await apiSync({ uploads, videos: [...many, talk] }, null, { limits: { perSourceLimit: 2 } });
    expect(ids(perSource.catalog).sort()).toEqual([many[0].youtubeId, many[1].youtubeId, talk.youtubeId].sort());
  });

  it("honours the per-channel upload limit", async () => {
    const api = fakeApi(config);
    const spy = vi.spyOn(api, "listPlaylistVideoIds");
    await runSync({ mode: "api", api, sources, previous: null, overrides: NO_OVERRIDES, now: NOW, limits: { uploadsPerChannel: 7 } });
    expect(spy).toHaveBeenCalledWith(expect.any(String), 7);
  });
});

describe("runSync with the keyless feeds", () => {
  const game = makeCandidate({ youtubeId: testId("game") });
  const talk = makeCandidate({
    youtubeId: testId("talk"),
    title: "Hawks vs. Lakers Postgame Press Conference: Dyson Daniels",
    channelId: HAWKS,
    channelTitle: "Atlanta Hawks",
    publishedAt: "2026-11-10T04:00:00+00:00",
  });

  const ok = (title = "unused"): EmbedCheck => ({ status: "ok", title, channelTitle: "NBA" });

  function feedSync(
    feeds: Record<string, CandidateVideo[] | Error>,
    checkEmbed: (id: string) => Promise<EmbedCheck>,
    previous: Catalog | null = null,
    now = NOW,
  ) {
    return runSync({
      mode: "feed",
      sources,
      previous,
      overrides: NO_OVERRIDES,
      now,
      fetchFeed: async (source) => {
        const feed = feeds[source.channelId] ?? [];
        if (feed instanceof Error) throw feed;
        return feed;
      },
      checkEmbed,
    });
  }

  it("stores only videos that YouTube confirms are embeddable", async () => {
    const checks: Record<string, EmbedCheck> = { [game.youtubeId]: ok(), [talk.youtubeId]: { status: "unavailable" } };
    const { catalog, report } = await feedSync({ [NBA]: [game], [HAWKS]: [talk] }, async (id) => checks[id]);

    expect(ids(catalog)).toEqual([game.youtubeId]);
    expect(catalog.videos[0]).toMatchObject({ embeddable: true, durationSeconds: null });
    expect(catalog.videos[0].provenance.discoveryMethod).toBe("channel-feed");
    expect(report.rejected[0]).toMatchObject({ youtubeId: talk.youtubeId, rejection: "UNAVAILABLE_VIDEO", ruleId: "embed-unavailable" });
  });

  it("holds back a new video when the embed check is inconclusive", async () => {
    const { catalog, report } = await feedSync({ [NBA]: [game] }, async () => ({ status: "unknown" }));
    expect(catalog.videos).toEqual([]);
    expect(report.rejected[0].ruleId).toBe("embed-check-inconclusive");
  });

  it("does not spend an embed check on videos the rules reject", async () => {
    const hype = makeCandidate({ youtubeId: testId("hype"), title: "Los Angeles Lakers 2026-27 Season Hype Video" });
    const checkEmbed = vi.fn(async () => ok());
    await feedSync({ [NBA]: [hype] }, checkEmbed);
    expect(checkEmbed).not.toHaveBeenCalled();
  });

  it("is idempotent and skips the embed check for recently verified videos", async () => {
    const first = await feedSync({ [NBA]: [game], [HAWKS]: [talk] }, async () => ok());
    const checkEmbed = vi.fn(async () => ok());
    const second = await feedSync({ [NBA]: [game], [HAWKS]: [talk] }, checkEmbed, first.catalog);

    expect(second.catalog).toEqual(first.catalog);
    expect(checkEmbed).not.toHaveBeenCalled();
  });

  it("verifies a video again once its last check is a day old", async () => {
    const first = await feedSync({ [NBA]: [game] }, async () => ok());
    const nextDay = new Date(NOW.getTime() + 25 * HOUR);
    const checkEmbed = vi.fn(async () => ok());
    const second = await feedSync({ [NBA]: [game] }, checkEmbed, first.catalog, nextDay);

    expect(checkEmbed).toHaveBeenCalledWith(game.youtubeId);
    expect(second.catalog.videos[0].provenance.metadataCheckedAt).toBe(nextDay.toISOString());
  });

  it("keeps videos that have dropped out of the feed, without checking fresh ones", async () => {
    const first = await feedSync({ [NBA]: [game], [HAWKS]: [talk] }, async () => ok());
    const checkEmbed = vi.fn(async () => ok());
    const { catalog } = await feedSync({ [NBA]: [game], [HAWKS]: [] }, checkEmbed, first.catalog);

    expect(ids(catalog)).toEqual([game.youtubeId, talk.youtubeId]);
    expect(checkEmbed).not.toHaveBeenCalled();
  });

  it("re-verifies stale videos that are no longer in any feed", async () => {
    const first = await feedSync({ [NBA]: [game], [HAWKS]: [talk] }, async () => ok());
    const nextDay = new Date(NOW.getTime() + 25 * HOUR);
    const outcomes: [EmbedCheck, string[]][] = [
      [ok(talk.title), [game.youtubeId, talk.youtubeId]],
      [{ status: "unavailable" }, [game.youtubeId]],
      [{ status: "unknown" }, [game.youtubeId, talk.youtubeId]],
      // The uploader renamed it to something that no longer qualifies.
      [ok("Dyson Daniels Mic'd Up"), [game.youtubeId]],
    ];
    for (const [check, expected] of outcomes) {
      const checkEmbed = async (id: string) => (id === talk.youtubeId ? check : ok());
      const { catalog } = await feedSync({ [NBA]: [game], [HAWKS]: [] }, checkEmbed, first.catalog, nextDay);
      expect(ids(catalog), JSON.stringify(check)).toEqual(expected);
    }
  });

  it("carries on when one channel's feed fails", async () => {
    const { catalog, report } = await feedSync({ [NBA]: [game], [HAWKS]: new Error("Feed request failed with HTTP 500") }, async () => ok());
    expect(ids(catalog)).toEqual([game.youtubeId]);
    expect(report.sourceErrors).toEqual([{ channelId: HAWKS, name: "Atlanta Hawks", message: "Feed request failed with HTTP 500" }]);
  });

  it("produces an empty but valid catalog when nothing qualifies", async () => {
    const { catalog } = await feedSync({}, async () => ok());
    expect(catalogSchema.parse(catalog).videos).toEqual([]);
  });

  it("labels the catalog as a seed when asked", async () => {
    const { catalog } = await runSync({
      mode: "feed",
      catalogMode: "seed",
      sources,
      previous: null,
      overrides: NO_OVERRIDES,
      now: NOW,
      fetchFeed: async () => [],
      checkEmbed: async () => ok(),
    });
    expect(catalog.mode).toBe("seed");
  });
});

describe("runSync review regressions", () => {
  const ok: EmbedCheck = { status: "ok", title: "x", channelTitle: "NBA" };

  it("keeps a published video that is still in its feed when the embed check is inconclusive", async () => {
    const game = makeCandidate({ youtubeId: testId("game") });
    const base = { mode: "feed" as const, sources, overrides: NO_OVERRIDES, fetchFeed: async (source: Source) => (source.channelId === NBA ? [game] : []) };
    const first = await runSync({ ...base, previous: null, now: NOW, checkEmbed: async () => ok });
    const nextDay = new Date(NOW.getTime() + 30 * HOUR);
    const second = await runSync({ ...base, previous: first.catalog, now: nextDay, checkEmbed: async () => ({ status: "unknown" }) });
    expect(ids(second.catalog)).toEqual([game.youtubeId]);
    expect(second.catalog.videos[0]).toEqual(first.catalog.videos[0]);
  });

  it("records a failed video-details batch and carries on", async () => {
    const game = highlight("game");
    const config: FakeApiConfig = { uploads: { [NBA]: [game.youtubeId], [HAWKS]: [] }, videos: [game], failVideos: new YouTubeApiError("http", "backend error", 503) };
    const { catalog, report } = await apiSync(config);
    expect(catalog.videos).toEqual([]);
    expect(report.sourceErrors).toEqual([{ channelId: "", name: "Video details", message: "backend error" }]);
  });

  it("drops a video whose metadata fails the schema instead of writing a bad catalog", async () => {
    const odd = highlight("odd", { thumbnailUrl: "https://example.com/thumb.jpg" });
    const { catalog, report } = await apiSync({ uploads: { [NBA]: [odd.youtubeId], [HAWKS]: [] }, videos: [odd] });
    expect(catalog.videos).toEqual([]);
    expect(report.rejectedByReason).toEqual({ INVALID_METADATA: 1 });
  });

  it("keeps a known duration when a feed run rechecks an API record", async () => {
    const game = highlight("game");
    const first = await apiSync({ uploads: { [NBA]: [game.youtubeId], [HAWKS]: [] }, videos: [game] });
    const nextDay = new Date(NOW.getTime() + 30 * HOUR);
    const { catalog } = await runSync({ mode: "feed", sources, overrides: NO_OVERRIDES, previous: first.catalog, now: nextDay, fetchFeed: async () => [], checkEmbed: async () => ({ ...ok, title: game.title }) });
    expect(catalog.videos[0].durationSeconds).toBe(600);
  });
});
