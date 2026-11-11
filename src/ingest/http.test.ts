import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry, mapWithConcurrency, NetworkError, type FetchLike } from "./http";

const noSleep = { sleep: async () => {} };

function responses(...statuses: number[]): FetchLike {
  let call = 0;
  return vi.fn(async () => new Response("body", { status: statuses[Math.min(call++, statuses.length - 1)] }));
}

describe("fetchWithRetry", () => {
  it("returns a successful response without retrying", async () => {
    const fetchImpl = responses(200);
    const response = await fetchWithRetry(fetchImpl, "https://example.test", noSleep);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a busy server and succeeds when it recovers", async () => {
    const fetchImpl = responses(503, 429, 200);
    const response = await fetchWithRetry(fetchImpl, "https://example.test", noSleep);
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives back the last error response once the retries are used up", async () => {
    const fetchImpl = responses(500);
    const response = await fetchWithRetry(fetchImpl, "https://example.test", { ...noSleep, retries: 2 });
    expect(response.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a client error such as 404", async () => {
    const fetchImpl = responses(404, 200);
    const response = await fetchWithRetry(fetchImpl, "https://example.test", noSleep);
    expect(response.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws NetworkError when no response ever arrives, as on a timeout", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(fetchWithRetry(fetchImpl, "https://example.test", { ...noSleep, retries: 1 })).rejects.toThrow(NetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recovers from a dropped connection on a later attempt", async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      if (call++ === 0) throw new TypeError("fetch failed");
      return new Response("ok");
    };
    expect((await fetchWithRetry(fetchImpl, "https://example.test", noSleep)).status).toBe(200);
  });

  it("waits as long as Retry-After asks, within a cap", async () => {
    const waits: number[] = [];
    let call = 0;
    const fetchImpl: FetchLike = async () =>
      call++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : new Response("ok");
    await fetchWithRetry(fetchImpl, "https://example.test", { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([2000]);
  });

  it("retries responses the caller marks as retryable", async () => {
    const fetchImpl = responses(403, 200);
    const response = await fetchWithRetry(fetchImpl, "https://example.test", {
      ...noSleep,
      isRetryable: async (candidate) => candidate.status === 403,
    });
    expect(response.status).toBe(200);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps results in input order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (delay) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running--;
      return delay * 2;
    });
    expect(results).toEqual([60, 10, 40, 2, 20]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (item) => item)).toEqual([]);
  });
});
