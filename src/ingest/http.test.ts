import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry, mapWithConcurrency, NetworkError, readJsonLimited, readTextLimited, ResponseTooLargeError, type FetchLike } from "./http";

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

describe("readTextLimited", () => {
  /** A body that arrives in separate chunks, like a real network response, with no Content-Length. */
  const streamed = (...chunks: string[]) =>
    new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));

  it("reads a body within the limit, whole and in order, including multi-byte characters split across chunks", async () => {
    expect(await readTextLimited(new Response("hello"), 100)).toBe("hello");
    const bytes = new TextEncoder().encode("caf\u00e9 \u{1F3C0}");
    const split = new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 4)); c.enqueue(bytes.slice(4, 9)); c.enqueue(bytes.slice(9)); c.close(); } }));
    expect(await readTextLimited(split, 100)).toBe("caf\u00e9 \u{1F3C0}");
  });

  it("accepts a body exactly at the limit and refuses one byte over", async () => {
    expect(await readTextLimited(new Response("12345"), 5)).toBe("12345");
    await expect(readTextLimited(streamed("12345", "6"), 5)).rejects.toThrow(ResponseTooLargeError);
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    const response = new Response("x", { headers: { "content-length": "999999999" } });
    const text = vi.spyOn(response, "text");
    await expect(readTextLimited(response, 1000)).rejects.toThrow(ResponseTooLargeError);
    expect(text).not.toHaveBeenCalled();
  });

  it("cuts off a stream that never ends, and a body longer than it declared", async () => {
    let pulls = 0;
    const endless = new Response(new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode("x".repeat(1000))); } }));
    await expect(readTextLimited(endless, 5000)).rejects.toThrow(ResponseTooLargeError);
    expect(pulls).toBeLessThan(20); // stopped soon after the limit, not read forever

    const lying = new Response("x".repeat(500), { headers: { "content-length": "10" } });
    await expect(readTextLimited(lying, 100)).rejects.toThrow(ResponseTooLargeError);
  });

  it("parses JSON through the same limit, and still throws on invalid JSON", async () => {
    expect(await readJsonLimited(new Response('{"a":1}'), 100)).toEqual({ a: 1 });
    await expect(readJsonLimited(new Response("not json"), 100)).rejects.toThrow(SyntaxError);
    await expect(readJsonLimited(new Response('{"a":"' + "x".repeat(200) + '"}'), 100)).rejects.toThrow(ResponseTooLargeError);
  });
});
