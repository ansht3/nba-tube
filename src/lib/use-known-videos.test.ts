import { describe, expect, it } from "vitest";
import { LOOKUP_CHUNK, chunk } from "./use-known-videos";

describe("chunk", () => {
  it("splits a list into groups of the lookup size, keeping order, with a short last group", () => {
    const ids = Array.from({ length: LOOKUP_CHUNK * 2 + 5 }, (_, i) => `id${i}`);
    const groups = chunk(ids, LOOKUP_CHUNK);
    expect(groups.map((g) => g.length)).toEqual([LOOKUP_CHUNK, LOOKUP_CHUNK, 5]);
    expect(groups.flat()).toEqual(ids);
  });

  it("gives no groups for an empty list", () => {
    expect(chunk([], 48)).toEqual([]);
  });
});
