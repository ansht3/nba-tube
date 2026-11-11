import { describe, expect, it, vi } from "vitest";
import { makeSource } from "@/test/fixtures";
import type { FetchLike } from "../http";
import { FeedError, fetchChannelFeed, parseFeed } from "./feed";

const NBA = "UCWJ2lWNubArHWmf3FIHbfcQ";
const noRetry = { retries: 0, sleep: async () => {} };

function entry(fields: { id?: string; channelId?: string; title?: string; published?: string }) {
  const { id = "_7TMNmEtbBk", channelId = NBA, title = "A title", published = "2026-11-11T17:00:01+00:00" } = fields;
  return ` <entry>
  <id>yt:video:${id}</id>
  <yt:videoId>${id}</yt:videoId>
  <yt:channelId>${channelId}</yt:channelId>
  <title>${title}</title>
  <author><name>NBA</name><uri>https://www.youtube.com/channel/${channelId}</uri></author>
  <published>${published}</published>
  <media:group><media:thumbnail url="https://i4.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360"/></media:group>
 </entry>`;
}

function feed(...entries: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><feed><title>Videos</title><author><name>NBA</name></author>${entries.join("")}</feed>`;
}

describe("parseFeed", () => {
  it("reads id, title, channel and date, leaving unknown fields null", () => {
    const [video] = parseFeed(feed(entry({ title: "CELTICS at 76ERS | FULL GAME HIGHLIGHTS | November 10, 2026" })));
    expect(video).toMatchObject({
      youtubeId: "_7TMNmEtbBk",
      title: "CELTICS at 76ERS | FULL GAME HIGHLIGHTS | November 10, 2026",
      channelId: NBA,
      channelTitle: "NBA",
      thumbnailUrl: "https://i.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg",
      durationSeconds: null,
      embeddable: null,
      discoveryMethod: "channel-feed",
    });
  });

  it("decodes XML entities in titles", () => {
    const [video] = parseFeed(feed(entry({ title: "30 PTS &amp; 11 REB &#39;In Utah&#39; &quot;live&quot; &#x1F525;" })));
    expect(video.title).toBe(`30 PTS & 11 REB 'In Utah' "live" 🔥`);
  });

  it("skips entries with a missing or malformed id, title or date", () => {
    const xml = feed(
      entry({ id: "bad id" }),
      entry({ title: "" }),
      entry({ published: "not a date" }),
      entry({ id: "abcdefghijk", title: "Kept" }),
    );
    expect(parseFeed(xml).map((video) => video.title)).toEqual(["Kept"]);
  });

  it("returns nothing for an empty feed or a non-feed document", () => {
    expect(parseFeed(feed())).toEqual([]);
    expect(parseFeed("<html>Error 404</html>")).toEqual([]);
  });
});

describe("fetchChannelFeed", () => {
  const source = makeSource();

  it("reads the long-form playlist first", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response(feed(entry({}))));
    const videos = await fetchChannelFeed(source, fetchImpl, noRetry);
    expect(videos).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toContain("playlist_id=UULFWJ2lWNubArHWmf3FIHbfcQ");
  });

  it("falls back to the channel feed when the long-form playlist is missing or empty", async () => {
    for (const first of [new Response("", { status: 404 }), new Response(feed())]) {
      const fetchImpl: FetchLike = vi.fn(async (url: string) => (url.includes("playlist_id") ? first : new Response(feed(entry({})))));
      expect(await fetchChannelFeed(source, fetchImpl, noRetry)).toHaveLength(1);
      expect(vi.mocked(fetchImpl).mock.calls[1][0]).toContain(`channel_id=${NBA}`);
    }
  });

  it("drops entries uploaded by a different channel", async () => {
    const xml = feed(entry({}), entry({ id: "abcdefghijk", channelId: "UCeYc_OjHs3QNxIjti2whKzg" }));
    const videos = await fetchChannelFeed(source, async () => new Response(xml), noRetry);
    expect(videos.map((video) => video.youtubeId)).toEqual(["_7TMNmEtbBk"]);
  });

  it("raises FeedError when the feed cannot be read", async () => {
    await expect(fetchChannelFeed(source, async () => new Response("", { status: 500 }), noRetry)).rejects.toThrow(FeedError);
    await expect(fetchChannelFeed(source, async () => new Response("", { status: 404 }), noRetry)).rejects.toThrow(FeedError);
  });
});
