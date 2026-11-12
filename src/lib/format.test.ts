import { describe, expect, it } from "vitest";
import { formatDuration, formatLongDate, formatRelative, formatShortDate, pluralize } from "./format";

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(588)).toBe("9:48");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("shows nothing when the length is unknown or invalid", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-5)).toBe("");
  });
});

describe("dates", () => {
  const now = new Date("2026-11-11T18:00:00Z");

  it("shows the Eastern Time date, so a late game keeps its game day", () => {
    // 03:30 UTC on the 11th is 22:30 on the 10th in New York.
    expect(formatShortDate("2026-11-11T03:30:00Z", now)).toBe("Nov 10");
    expect(formatLongDate("2026-11-11T03:30:00Z")).toBe("November 10, 2026");
  });

  it("adds the year only for videos from an earlier year", () => {
    expect(formatShortDate("2026-04-15T16:00:00Z", now)).toBe("Apr 15");
    expect(formatShortDate("2025-04-15T16:00:00Z", now)).toBe("Apr 15, 2025");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatShortDate("not a date", now)).toBe("");
    expect(formatLongDate("")).toBe("");
  });
});

describe("pluralize", () => {
  it("picks the right form and groups thousands", () => {
    expect(pluralize(1, "video")).toBe("1 video");
    expect(pluralize(0, "video")).toBe("0 videos");
    expect(pluralize(1234, "video")).toBe("1,234 videos");
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-11-12T20:00:00Z");
  it.each([
    ["2026-11-12T19:59:30Z", "just now"],
    ["2026-11-12T19:59:00Z", "1 minute ago"],
    ["2026-11-12T13:00:00Z", "7 hours ago"],
    ["2026-11-11T20:00:00Z", "1 day ago"],
    ["2026-10-29T20:00:00Z", "2 weeks ago"],
    ["2025-11-01T20:00:00Z", "1 year ago"],
    ["2026-11-13T00:00:00Z", "just now"],
  ])("%s is %s", (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });

  it("returns an empty string for a bad date", () => {
    expect(formatRelative("not a date", now)).toBe("");
  });
});
