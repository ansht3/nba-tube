import { describe, expect, it } from "vitest";
import type { FetchLike } from "../http";
import { createYouTubeApi, parseDuration, toCandidate, YouTubeApiError } from "./api";

const API_KEY = "test-key-that-must-not-leak";
const retry = { retries: 2, sleep: async () => {} };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function apiError(status: number, reason: string, message = "error") {
  return json({ error: { code: status, message, errors: [{ reason }] } }, status);
}

function videoResource(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    snippet: {
      title: "CELTICS at 76ERS | FULL GAME HIGHLIGHTS | November 10, 2026",
      channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
      channelTitle: "NBA",
      publishedAt: "2026-11-11T05:30:00Z",
      liveBroadcastContent: "none",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    contentDetails: { duration: "PT9M48S" },
    status: { privacyStatus: "public", embeddable: true, uploadStatus: "processed" },
    player: { embedWidth: "640", embedHeight: "360" },
    ...overrides,
  };
}

/** Records every requested URL and answers from a list of canned responses. */
function recordingFetch(answers: (() => Response)[]) {
  const urls: URL[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(new URL(url));
    return answers[Math.min(urls.length - 1, answers.length - 1)]();
  };
  return { fetchImpl, urls };
}

describe("parseDuration", () => {
  it("converts ISO 8601 durations to seconds", () => {
    expect(parseDuration("PT9M48S")).toBe(588);
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("PT45S")).toBe(45);
    expect(parseDuration("P1DT1S")).toBe(86_401);
  });

  it("returns null for a missing, zero or malformed duration", () => {
    for (const value of [undefined, null, "", "P0D", "PT0S", "9:48", "PT-5M", 588]) {
      expect(parseDuration(value), String(value)).toBeNull();
    }
  });
});

describe("toCandidate", () => {
  it("maps a complete resource", () => {
    expect(toCandidate(videoResource("_7TMNmEtbBk"))).toMatchObject({
      youtubeId: "_7TMNmEtbBk",
      durationSeconds: 588,
      embeddable: true,
      privacyStatus: "public",
      liveBroadcast: "none",
      isVertical: false,
      discoveryMethod: "data-api",
    });
  });

  it("skips a resource that lacks an id, a title, a channel or a valid date", () => {
    const snippet = videoResource("_7TMNmEtbBk").snippet;
    const broken = [
      videoResource("bad"),
      videoResource("_7TMNmEtbBk", { snippet: undefined }),
      videoResource("_7TMNmEtbBk", { snippet: { ...snippet, title: "  " } }),
      videoResource("_7TMNmEtbBk", { snippet: { ...snippet, channelId: undefined } }),
      videoResource("_7TMNmEtbBk", { snippet: { ...snippet, publishedAt: "soon" } }),
    ];
    for (const resource of broken) expect(toCandidate(resource)).toBeNull();
  });

  it("keeps a partial resource and marks what it does not know as null", () => {
    const candidate = toCandidate(videoResource("_7TMNmEtbBk", { contentDetails: undefined, status: undefined, player: undefined }));
    expect(candidate).toMatchObject({ durationSeconds: null, embeddable: null, privacyStatus: null, isVertical: null });
  });

  it("treats an unparseable duration as unknown rather than failing", () => {
    expect(toCandidate(videoResource("_7TMNmEtbBk", { contentDetails: { duration: "soon" } }))?.durationSeconds).toBeNull();
  });

  it("recognises a vertical video from the embed shape", () => {
    const vertical = videoResource("_7TMNmEtbBk", { player: { embedWidth: "360", embedHeight: "640" } });
    expect(toCandidate(vertical)?.isVertical).toBe(true);
  });

  it("skips a video that is still processing", () => {
    const status = { privacyStatus: "public", embeddable: true, uploadStatus: "uploaded" };
    expect(toCandidate(videoResource("_7TMNmEtbBk", { status }))).toBeNull();
  });

  it("falls back to the standard thumbnail when the API omits one", () => {
    const snippet = { ...videoResource("_7TMNmEtbBk").snippet, thumbnails: undefined };
    expect(toCandidate(videoResource("_7TMNmEtbBk", { snippet }))?.thumbnailUrl).toBe("https://i.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg");
  });
});

describe("createYouTubeApi", () => {
  it("resolves the uploads playlist of each channel", async () => {
    const { fetchImpl, urls } = recordingFetch([
      () => json({ items: [{ id: "UCWJ2lWNubArHWmf3FIHbfcQ", snippet: { title: "NBA" }, contentDetails: { relatedPlaylists: { uploads: "UUWJ2lWNubArHWmf3FIHbfcQ" } } }] }),
    ]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });
    const channels = await api.getChannels(["UCWJ2lWNubArHWmf3FIHbfcQ", "UCeYc_OjHs3QNxIjti2whKzg"]);

    expect(channels.get("UCWJ2lWNubArHWmf3FIHbfcQ")).toEqual({ title: "NBA", uploadsPlaylistId: "UUWJ2lWNubArHWmf3FIHbfcQ" });
    expect(channels.has("UCeYc_OjHs3QNxIjti2whKzg")).toBe(false);
    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(api.unitsUsed).toBe(1);
  });

  it("pages through a playlist until the limit is reached", async () => {
    const page = (ids: string[], nextPageToken?: string) => () =>
      json({ items: ids.map((videoId) => ({ contentDetails: { videoId } })), nextPageToken });
    const { fetchImpl, urls } = recordingFetch([page(["aaaaaaaaaaa", "bbbbbbbbbbb"], "next"), page(["ccccccccccc", "ddddddddddd"], "more")]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });

    expect(await api.listPlaylistVideoIds("UUWJ2lWNubArHWmf3FIHbfcQ", 3)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get("pageToken")).toBe("next");
    expect(api.unitsUsed).toBe(2);
  });

  it("stops paging when the playlist ends and ignores malformed items", async () => {
    const { fetchImpl } = recordingFetch([() => json({ items: [{ contentDetails: { videoId: "aaaaaaaaaaa" } }, { contentDetails: {} }, {}] })]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });
    expect(await api.listPlaylistVideoIds("UUWJ2lWNubArHWmf3FIHbfcQ", 50)).toEqual(["aaaaaaaaaaa"]);
  });

  it("fetches video details 50 at a time and leaves out videos YouTube does not return", async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `video${String(index).padStart(6, "0")}`);
    const { fetchImpl, urls } = recordingFetch([
      () => json({ items: ids.slice(0, 50).filter((id) => id !== "video000007").map((id) => videoResource(id)) }),
      () => json({ items: ids.slice(50).map((id) => videoResource(id)) }),
    ]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });
    const videos = await api.getVideos(ids);

    expect(videos).toHaveLength(59);
    expect(videos.some((video) => video.youtubeId === "video000007")).toBe(false);
    expect(urls[0].searchParams.get("id")?.split(",")).toHaveLength(50);
    expect(urls[1].searchParams.get("id")?.split(",")).toHaveLength(10);
  });

  it("copes with a response that has no items at all", async () => {
    const { fetchImpl } = recordingFetch([() => json({})]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });
    expect(await api.getVideos(["aaaaaaaaaaa"])).toEqual([]);
  });

  it("reports an invalid key clearly and without repeating the key", async () => {
    const body = { error: { code: 400, message: "API key not valid. Please pass a valid API key.", errors: [{ reason: "badRequest" }], details: [{ reason: "API_KEY_INVALID" }] } };
    const { fetchImpl } = recordingFetch([() => json(body, 400)]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });

    const error = await api.getChannels(["UCWJ2lWNubArHWmf3FIHbfcQ"]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(YouTubeApiError);
    expect((error as YouTubeApiError).kind).toBe("invalid-key");
    expect((error as YouTubeApiError).message).not.toContain(API_KEY);
  });

  it("reports an exhausted daily quota without retrying", async () => {
    const { fetchImpl, urls } = recordingFetch([() => apiError(403, "quotaExceeded")]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });

    await expect(api.getVideos(["aaaaaaaaaaa"])).rejects.toMatchObject({ kind: "quota-exceeded" });
    expect(urls).toHaveLength(1);
  });

  it("waits out a short rate limit and then succeeds", async () => {
    const { fetchImpl, urls } = recordingFetch([() => apiError(403, "rateLimitExceeded"), () => json({ items: [videoResource("aaaaaaaaaaa")] })]);
    const api = createYouTubeApi({ apiKey: API_KEY, fetch: fetchImpl, retry });

    expect(await api.getVideos(["aaaaaaaaaaa"])).toHaveLength(1);
    expect(urls).toHaveLength(2);
  });

  it("distinguishes forbidden, not found and other failures", async () => {
    const cases: [Response, string][] = [
      [apiError(403, "accessNotConfigured", "API not enabled"), "forbidden"],
      [apiError(404, "playlistNotFound"), "not-found"],
      [apiError(400, "invalidParameter"), "http"],
      [new Response("<html>bad gateway</html>", { status: 200 }), "bad-response"],
    ];
    for (const [response, kind] of cases) {
      const api = createYouTubeApi({ apiKey: API_KEY, fetch: async () => response.clone(), retry });
      await expect(api.listPlaylistVideoIds("UUx", 5)).rejects.toMatchObject({ kind });
    }
  });

  it("never puts the key in an error message, whatever fails", async () => {
    const failures = [apiError(500, "backendError"), apiError(403, "forbidden"), new Response("not json")];
    for (const response of failures) {
      const api = createYouTubeApi({ apiKey: API_KEY, fetch: async () => response.clone(), retry: { retries: 0, sleep: async () => {} } });
      const error = (await api.getVideos(["aaaaaaaaaaa"]).catch((caught: unknown) => caught)) as Error;
      expect(error.message).not.toContain(API_KEY);
    }
  });
});
