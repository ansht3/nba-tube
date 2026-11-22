import { describe, expect, it } from "vitest";
import { makeVideo } from "@/test/fixtures";
import { lastEmbedCheckMs } from "./embed-check";
import { videoSchema } from "./schema";

const withProvenance = (extra: Record<string, unknown>) => {
  const base = makeVideo();
  return { ...base, provenance: { ...base.provenance, ...extra } };
};

describe("lastEmbedCheckMs", () => {
  it("is the metadata check time until a recheck has run", () => {
    expect(lastEmbedCheckMs(makeVideo())).toBe(Date.parse("2026-11-11T18:00:00.000Z"));
  });

  it("is the later of the two, whichever order they were written in", () => {
    expect(lastEmbedCheckMs(withProvenance({ embedCheckedAt: "2026-11-15T00:00:00.000Z" }))).toBe(Date.parse("2026-11-15T00:00:00.000Z"));
    // A fresh metadata fetch after an old recheck counts too: it confirms playability as well.
    expect(lastEmbedCheckMs(withProvenance({ embedCheckedAt: "2026-11-01T00:00:00.000Z" }))).toBe(Date.parse("2026-11-11T18:00:00.000Z"));
  });

  it("ignores a value that cannot be read and treats a video with none as always due", () => {
    expect(lastEmbedCheckMs(withProvenance({ embedCheckedAt: "not a date" }))).toBe(Date.parse("2026-11-11T18:00:00.000Z"));
    expect(lastEmbedCheckMs(withProvenance({ metadataCheckedAt: "nope" }))).toBe(0);
  });
});

describe("provenance.embedCheckedAt in the schema", () => {
  it("is optional, so every stored record and the committed seed stay valid", () => {
    expect(videoSchema.safeParse(makeVideo()).success).toBe(true);
    expect(videoSchema.safeParse(withProvenance({ embedCheckedAt: "2026-11-15T00:00:00.000Z" })).success).toBe(true);
  });

  it("rejects a value that is not a date", () => {
    expect(videoSchema.safeParse(withProvenance({ embedCheckedAt: "yesterday" })).success).toBe(false);
  });
});
