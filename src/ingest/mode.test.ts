import { describe, expect, it } from "vitest";
import { resolveMode } from "./mode";

describe("resolveMode", () => {
  it("uses the Data API when a key is present", () => {
    expect(resolveMode({ requested: undefined, seed: false, apiKey: "key" })).toBe("api");
  });

  it("falls back to the keyless feeds when the key is missing", () => {
    expect(resolveMode({ requested: undefined, seed: false, apiKey: undefined })).toBe("feed");
    expect(resolveMode({ requested: undefined, seed: false, apiKey: "" })).toBe("feed");
  });

  it("refuses an explicit API run without a key instead of quietly doing something else", () => {
    expect(() => resolveMode({ requested: "api", seed: false, apiKey: undefined })).toThrow(/YOUTUBE_API_KEY/);
  });

  it("lets feed mode be forced even when a key exists", () => {
    expect(resolveMode({ requested: "feed", seed: false, apiKey: "key" })).toBe("feed");
  });

  it("always builds the seed from the feeds", () => {
    expect(resolveMode({ requested: "api", seed: true, apiKey: "key" })).toBe("feed");
  });

  it("rejects an unknown mode", () => {
    expect(() => resolveMode({ requested: "scrape", seed: false, apiKey: "key" })).toThrow(/Unknown mode/);
  });
});
