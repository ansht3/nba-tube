/** The part of the Web Storage API this module uses, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Store<Value> {
  /** The current value. The same object is returned until the value changes. */
  get(): Value;
  set(value: Value): void;
  update(change: (current: Value) => Value): void;
  subscribe(listener: () => void): () => void;
  /** What the server renders, and what the first client render must match. */
  readonly fallback: Value;
  /** False after the browser refused a write, for example in private mode or when storage is full. */
  isPersisting(): boolean;
}

export interface StoreOptions<Value> {
  key: string;
  fallback: Value;
  /** Turns whatever was stored into a valid value. It must never throw. */
  parse: (stored: unknown) => Value;
  /** Defaults to window.localStorage. Returns null where there is no storage, such as on the server. */
  storage?: () => StorageLike | null;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Reading the property itself throws when the browser blocks storage.
    return null;
  }
}

/**
 * A value kept in localStorage that components can subscribe to. Anything that
 * goes wrong with storage (missing, blocked, full, corrupted) degrades to an
 * in-memory value, so the interface keeps working for the current visit.
 */
export function createStore<Value>(options: StoreOptions<Value>): Store<Value> {
  const { key, fallback, parse } = options;
  const getStorage = options.storage ?? browserStorage;
  const listeners = new Set<() => void>();

  let value = fallback;
  let loaded = false;
  let persisting = true;
  let listeningForOtherTabs = false;

  function load() {
    loaded = true;
    try {
      const stored = getStorage()?.getItem(key);
      value = stored == null ? fallback : parse(JSON.parse(stored));
    } catch {
      value = fallback;
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function onStorageEvent(event: StorageEvent) {
    if (event.key !== key) return;
    // Another tab changed this key: pick up its value so both tabs agree.
    load();
    notify();
  }

  function get(): Value {
    if (!loaded) load();
    return value;
  }

  function set(next: Value) {
    loaded = true;
    value = next;
    try {
      const storage = getStorage();
      if (!storage) throw new Error("storage unavailable");
      storage.setItem(key, JSON.stringify(next));
      persisting = true;
    } catch {
      persisting = false;
    }
    notify();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (!listeningForOtherTabs && typeof window !== "undefined") {
      window.addEventListener("storage", onStorageEvent);
      listeningForOtherTabs = true;
    }
    return () => {
      listeners.delete(listener);
    };
  }

  // Plain functions rather than methods: React calls get and subscribe detached from the object.
  return {
    fallback,
    get,
    set,
    update: (change) => set(change(get())),
    subscribe,
    isPersisting: () => persisting,
  };
}
