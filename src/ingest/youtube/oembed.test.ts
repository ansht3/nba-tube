import { describe, expect, it } from "vitest";
import { checkEmbed } from "./oembed";

const noRetry = { retries: 0, sleep: async () => {} };

describe("checkEmbed", () => {
  it("reports an embeddable video with its current title", async () => {
    const body = JSON.stringify({ title: "NBA's Nightly Recap", author_name: "NBA" });
    const result = await checkEmbed("_7TMNmEtbBk", async () => new Response(body), noRetry);
    expect(result).toEqual({ status: "ok", title: "NBA's Nightly Recap", channelTitle: "NBA" });
  });

  it("treats missing, private and embed-disabled videos as unavailable", async () => {
    for (const status of [400, 401, 403, 404]) {
      const result = await checkEmbed("_7TMNmEtbBk", async () => new Response("", { status }), noRetry);
      expect(result, `HTTP ${status}`).toEqual({ status: "unavailable" });
    }
  });

  it("learns nothing from a server error, a network failure or a malformed body", async () => {
    const failures = [
      async () => new Response("", { status: 500 }),
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => new Response("<html>"),
      async () => new Response(JSON.stringify({ title: 42 })),
    ];
    for (const fetchImpl of failures) {
      expect(await checkEmbed("_7TMNmEtbBk", fetchImpl, noRetry)).toEqual({ status: "unknown" });
    }
  });

  it("asks about the watch URL of the given id", async () => {
    let requested = "";
    await checkEmbed("_7TMNmEtbBk", async (url) => ((requested = url), new Response("{}")), noRetry);
    expect(requested).toContain(encodeURIComponent("https://www.youtube.com/watch?v=_7TMNmEtbBk"));
  });
});
