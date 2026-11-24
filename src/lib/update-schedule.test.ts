import { describe, expect, it } from "vitest";
import { CHECK_INTERVAL_MS, JITTER, MAX_INTERVAL_MS, MIN_GAP_ON_FOCUS_MS, nextDelay, shouldCheckOnFocus } from "./update-schedule";

describe("nextDelay", () => {
  it("waits about five minutes, spread by the jitter", () => {
    expect(nextDelay(0, () => 0.5)).toBe(CHECK_INTERVAL_MS);
    expect(nextDelay(0, () => 0)).toBe(Math.round(CHECK_INTERVAL_MS * (1 - JITTER)));
    expect(nextDelay(0, () => 1)).toBe(Math.round(CHECK_INTERVAL_MS * (1 + JITTER)));
  });

  it("stays within the jitter band for any random value", () => {
    for (let i = 0; i <= 100; i++) {
      const delay = nextDelay(0, () => i / 100);
      expect(delay).toBeGreaterThanOrEqual(CHECK_INTERVAL_MS * (1 - JITTER));
      expect(delay).toBeLessThanOrEqual(CHECK_INTERVAL_MS * (1 + JITTER));
    }
  });

  it("doubles after each failure and caps at half an hour", () => {
    expect(nextDelay(1, () => 0.5)).toBe(CHECK_INTERVAL_MS * 2);
    expect(nextDelay(2, () => 0.5)).toBe(CHECK_INTERVAL_MS * 4);
    expect(nextDelay(10, () => 0.5)).toBe(MAX_INTERVAL_MS);
  });
});

describe("shouldCheckOnFocus", () => {
  it("checks when it has been a while and skips a quick tab switch", () => {
    expect(shouldCheckOnFocus(0, MIN_GAP_ON_FOCUS_MS)).toBe(true);
    expect(shouldCheckOnFocus(0, MIN_GAP_ON_FOCUS_MS - 1)).toBe(false);
  });
});
