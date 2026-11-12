import { describe, expect, it, vi } from "vitest";
import { createStore, type StorageLike } from "./store";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const parseNumbers = (stored: unknown) => (Array.isArray(stored) ? stored.filter((entry) => typeof entry === "number") : []);

function numberStore(storage: StorageLike | null) {
  return createStore<number[]>({ key: "test:numbers", fallback: [], parse: parseNumbers, storage: () => storage });
}

describe("createStore", () => {
  it("starts from the fallback when nothing is stored", () => {
    expect(numberStore(memoryStorage()).get()).toEqual([]);
  });

  it("reads and validates what is stored", () => {
    const storage = memoryStorage({ "test:numbers": JSON.stringify([1, "two", 3]) });
    expect(numberStore(storage).get()).toEqual([1, 3]);
  });

  it("falls back when the stored value is not JSON", () => {
    const storage = memoryStorage({ "test:numbers": "{not json" });
    expect(numberStore(storage).get()).toEqual([]);
  });

  it("writes changes and survives a reload", () => {
    const storage = memoryStorage();
    numberStore(storage).set([4, 5]);
    expect(storage.data.get("test:numbers")).toBe("[4,5]");
    // A new store over the same storage is what a page reload looks like.
    expect(numberStore(storage).get()).toEqual([4, 5]);
  });

  it("returns the same object until the value changes", () => {
    const store = numberStore(memoryStorage({ "test:numbers": "[1]" }));
    expect(store.get()).toBe(store.get());
    const before = store.get();
    store.update((current) => [...current, 2]);
    expect(store.get()).not.toBe(before);
    expect(store.get()).toEqual([1, 2]);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const store = numberStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set([1]);
    unsubscribe();
    store.set([2]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps working in memory when the browser refuses to write", () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
    };
    const store = numberStore(full);
    expect(() => store.set([9])).not.toThrow();
    expect(store.get()).toEqual([9]);
    expect(store.isPersisting()).toBe(false);
  });

  it("keeps working when reading from storage throws", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new DOMException("Access is denied.", "SecurityError");
      },
      setItem: () => {},
    };
    expect(numberStore(blocked).get()).toEqual([]);
  });

  it("works without any storage at all, as on the server", () => {
    const store = numberStore(null);
    expect(store.get()).toEqual([]);
    store.set([1]);
    expect(store.get()).toEqual([1]);
    expect(store.isPersisting()).toBe(false);
  });
});
