export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  /** Replaced in tests so that backoff does not slow them down. */
  sleep?: (ms: number) => Promise<void>;
  /** Lets a caller mark more responses as worth retrying, such as a rate-limit 403. */
  isRetryable?: (response: Response) => Promise<boolean>;
}

/** The request never produced a response: DNS failure, reset connection or timeout. */
export class NetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NetworkError";
  }
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRY_AFTER_MS = 30_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isServerBusy(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelay(response: Response | null, attempt: number, baseDelayMs: number): number {
  const retryAfter = Number(response?.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  }
  // Exponential backoff with jitter, so parallel requests do not retry in step.
  return baseDelayMs * 2 ** attempt * (0.5 + Math.random() / 2);
}

/**
 * Fetches a URL, retrying when the server is busy or the network fails.
 * Returns the last response even if it is an error status: callers know what a
 * 403 or 404 means for their endpoint. Throws NetworkError only when no
 * response arrived at all.
 */
export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      lastError = error;
    }

    if (response) {
      const shouldRetry = isServerBusy(response.status) || ((await options.isRetryable?.(response)) ?? false);
      if (!shouldRetry || attempt === retries) return response;
    }

    if (attempt < retries) await sleep(retryDelay(response, attempt, baseDelayMs));
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new NetworkError(`No response after ${retries + 1} attempts: ${reason}`, { cause: lastError });
}

/** An upstream body was larger than the caller is willing to hold in memory. */
export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`The response is larger than ${maxBytes} bytes.`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Reads a response body as text, refusing more than `maxBytes`. `response.text()` buffers whatever the server sends, and
 * the worker has a small memory limit, so a broken or hostile upstream could otherwise make one request cost all of it.
 * A declared Content-Length over the limit is refused without reading; a body that is longer than it declared (or is
 * streamed with no length) is cut off as soon as it passes the limit.
 */
export async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readJsonLimited(response: Response, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readTextLimited(response, maxBytes));
}

/** Largest bodies each upstream is allowed to send. All are far above what the real endpoints return. */
export const MAX_FEED_BYTES = 1_000_000;
export const MAX_API_BYTES = 4_000_000;
export const MAX_OEMBED_BYTES = 100_000;
export const MAX_CATALOG_BYTES = 30_000_000;

/** Runs async work over a list a few items at a time, keeping results in input order. */
export async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
