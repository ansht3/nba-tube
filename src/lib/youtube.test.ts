import { describe, expect, it } from "vitest";
import { channelUrl, embedUrl, watchUrl } from "./youtube";

describe("YouTube URLs", () => {
  it("builds the watch and channel links", () => {
    expect(watchUrl("_7TMNmEtbBk")).toBe("https://www.youtube.com/watch?v=_7TMNmEtbBk");
    expect(channelUrl("UCWJ2lWNubArHWmf3FIHbfcQ")).toBe("https://www.youtube.com/channel/UCWJ2lWNubArHWmf3FIHbfcQ");
  });

  it("embeds from the privacy-enhanced domain without autoplay", () => {
    const url = new URL(embedUrl("_7TMNmEtbBk"));
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/_7TMNmEtbBk");
    expect(url.searchParams.get("rel")).toBe("0");
    expect(url.searchParams.has("origin")).toBe(false);
    expect(url.searchParams.has("autoplay")).toBe(false);
  });

  it("cannot be steered to another host or path by a hostile id", () => {
    for (const id of ["../../evil", "x?autoplay=1&list=y", "a/b#c", "@evil.example/"]) {
      const embed = new URL(embedUrl(id));
      expect(embed.origin).toBe("https://www.youtube-nocookie.com");
      expect(embed.pathname.split("/")).toHaveLength(3);
      expect(embed.searchParams.has("autoplay")).toBe(false);

      const watch = new URL(watchUrl(id));
      expect(watch.origin).toBe("https://www.youtube.com");
      expect(watch.searchParams.get("v")).toBe(id);
      expect([...watch.searchParams.keys()]).toEqual(["v"]);
    }
  });
});
