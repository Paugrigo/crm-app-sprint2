// An in-memory copy of data loaded from Supabase, shared by every component that reads it.
// Supabase is the source of truth: after each create, edit, or delete, the caller passes the
// tables it changed to invalidate(), which refetches every store that reads one of them, and
// every subscribed component re-renders.
//
// Why a shared store and not per-component state: with Cache Components, Next.js keeps up to 3
// visited pages alive but hidden (React <Activity>) instead of unmounting them. Data copied into
// a page's useState would go stale (e.g. a deleted meeting still listed on `/` after going back).
// See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
//
// Browser-only: the data is loaded with the signed-in user's session cookie. Read it from Client
// Components that call use(browser()) inside a <Suspense> boundary. The store lives in memory
// only (never localStorage) and is cleared by the full page load after signing in or out.

import { use, useSyncExternalStore } from "react";

/** How many keys a keyed store caches at most (beyond the ones on screen or loading). */
const KEYED_STORE_LIMIT = 20;

/** Refetch when the tab becomes visible again, at most this often, to pick up other tabs' changes. */
const FOCUS_REFRESH_INTERVAL_MS = 30_000;

/** The database tables the app reads and writes. */
export type Table = "meetings" | "meeting_tags" | "tags" | "user_settings";

/** Options for createRemoteStore() and createKeyedRemoteStore(). */
export type RemoteStoreOptions = {
  /**
   * Every table the load function reads, including ones only joined or matched against (e.g. a
   * search that matches tag names reads `tags`). invalidate() uses this to decide what to reload,
   * so a missing table means pages showing stale data after a change.
   */
  tables: readonly Table[];
};

/** Every store created at module level, with the tables it reads. See invalidate(). */
const registry: { tables: ReadonlySet<Table>; refresh: () => Promise<void> }[] = [];

function register(tables: readonly Table[], refresh: () => Promise<void>) {
  registry.push({ tables: new Set(tables), refresh });
}

/**
 * Reloads every store that reads any of `tables`. Call it after a create, edit, or delete (also
 * when it failed: part of it may have been saved) with every table the change wrote, including
 * rows the database removes on its own (`on delete cascade`, e.g. deleting a tag deletes its
 * `meeting_tags` rows). Never rejects: a store that fails to reload keeps showing what it had.
 */
export async function invalidate(...tables: Table[]): Promise<void> {
  const reloads = registry
    .filter((store) => tables.some((table) => store.tables.has(table)))
    .map((store) => store.refresh().catch(() => {}));
  await Promise.all(reloads);
}

export type RemoteStore<T> = {
  /** The current data. Suspends until the first load finishes; throws if it fails. */
  useValue: () => T;
};

/** Resets for stores whose first load failed; see resetFailedLoads(). */
const failedLoads = new Set<() => void>();

/**
 * Lets every store whose first load failed try again on its next render. Call it before
 * re-rendering after an error, e.g. from the error page's "Try again".
 */
export function resetFailedLoads() {
  failedLoads.forEach((reset) => reset());
  failedLoads.clear();
}

/** Internal extras of a store, used by invalidate() and createKeyedRemoteStore(). */
type TrackedRemoteStore<T> = RemoteStore<T> & {
  /** Reloads the data from Supabase and notifies subscribers. Rejects if loading fails. */
  refresh: () => Promise<void>;
  /** Whether a mounted component is reading it. */
  watched: () => boolean;
  /** Whether a load has finished (so dropping it can't interrupt one React is waiting on). */
  loaded: () => boolean;
};

/**
 * A store for data that doesn't depend on a parameter (e.g. all of the user's tags). Create it
 * once, at module level: it registers itself for invalidate().
 */
export function createRemoteStore<T>(load: () => Promise<T>, options: RemoteStoreOptions): RemoteStore<T> {
  const store = createTrackedStore(load);
  register(options.tables, store.refresh);
  return { useValue: store.useValue };
}

function createTrackedStore<T>(load: () => Promise<T>): TrackedRemoteStore<T> {
  let value: T | undefined;
  let loaded = false;
  let firstLoad: Promise<void> | null = null;
  let lastLoadedAt = 0;
  const listeners = new Set<() => void>();

  async function refresh() {
    value = await load();
    loaded = true;
    lastLoadedAt = Date.now();
    // A later refresh succeeded after a failed first load: stop handing use() the rejection.
    if (failedLoads.delete(resetFailedLoad)) firstLoad = fulfilledPromise();
    listeners.forEach((listener) => listener());
  }

  function resetFailedLoad() {
    firstLoad = null;
  }

  function ensureLoaded(): Promise<void> {
    // Loaded by a refresh() before any component read it: hand use() a promise React already
    // knows is fulfilled, so it doesn't suspend.
    if (loaded && !firstLoad) firstLoad = fulfilledPromise();
    // A failed first load keeps its rejected promise, so every render throws the same error to
    // the error page. (Clearing it here instead would make React's re-render start a new load,
    // suspend again, and repeat forever whenever the request keeps failing.) The error page's
    // "Try again" calls resetFailedLoads() to allow a fresh attempt.
    firstLoad ??= refresh().catch((error: unknown) => {
      failedLoads.add(resetFailedLoad);
      throw error;
    });
    return firstLoad;
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastLoadedAt < FOCUS_REFRESH_INTERVAL_MS) return;
    refresh().catch(() => {
      // Keep showing the data we have; the next change or visit will retry.
    });
  }

  function subscribe(listener: () => void) {
    if (listeners.size === 0) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
      // Shown again after nobody was reading it (e.g. a cached search revisited): refetch in the
      // background if it's old, as on tab focus.
      if (loaded && Date.now() - lastLoadedAt >= FOCUS_REFRESH_INTERVAL_MS) {
        refresh().catch(() => {});
      }
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }

  function getSnapshot(): T {
    return value as T;
  }

  function useValue(): T {
    // Call use() on every render, not only until the data has loaded: React requires the same
    // use() calls in the render after a suspension. Once the first load has finished, this is
    // the same resolved promise, so it returns right away.
    use(ensureLoaded());
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  return { useValue, refresh, watched: () => listeners.size > 0, loaded: () => loaded };
}

export type KeyedRemoteStore<K, T> = {
  /** The data for `key`. Suspends until it's loaded; throws if loading fails. */
  useValue: (key: K) => T;
};

/**
 * Like createRemoteStore(), but one in-memory copy per key, e.g. per search term. Each key gets
 * its own store, so it suspends, caches, and refetches on tab focus the same way. On
 * invalidate(), it reloads the keys a mounted component is showing and forgets the others (they
 * load fresh the next time they're read).
 */
export function createKeyedRemoteStore<K, T>(
  load: (key: K) => Promise<T>,
  options: RemoteStoreOptions,
): KeyedRemoteStore<K, T> {
  // In order of last use (oldest first), so the cache can drop the least recently used keys.
  const stores = new Map<K, TrackedRemoteStore<T>>();

  function storeFor(key: K) {
    let store = stores.get(key);
    if (store) {
      stores.delete(key);
    } else {
      store = createTrackedStore(() => load(key));
      evictUnused();
    }
    stores.set(key, store);
    return store;
  }

  /**
   * Keeps at most KEYED_STORE_LIMIT keys by dropping the least recently used ones that nobody
   * is showing. Keys still loading are kept: React is waiting on their promise.
   */
  function evictUnused() {
    for (const [key, store] of stores) {
      if (stores.size < KEYED_STORE_LIMIT) return;
      if (!store.watched() && store.loaded()) stores.delete(key);
    }
  }

  async function refresh() {
    const reloads: Promise<void>[] = [];
    for (const [key, store] of stores) {
      if (store.watched()) reloads.push(store.refresh());
      else stores.delete(key);
    }
    await Promise.all(reloads);
  }

  register(options.tables, refresh);
  return { useValue: (key) => storeFor(key).useValue() };
}

/** A resolved promise marked the way React's use() marks promises it has seen resolve. */
function fulfilledPromise(): Promise<void> {
  return Object.assign(Promise.resolve(), { status: "fulfilled", value: undefined });
}

/** A readable message for a failed Supabase request. */
export function describeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if (/failed to fetch|network/i.test(message)) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    // Signed out or expired: requests go out as `anon`, which has no table privileges at all
    // ("permission denied for table ..."), or the token itself is rejected.
    if (/jwt|permission denied for/i.test(message)) {
      return "Your session has expired. Reload the page to sign in again.";
    }
    // Signed in, but Row Level Security refused the row (e.g. it isn't this user's).
    if (/row-level security/i.test(message)) {
      return "That item can't be changed from this account. Reload the page and try again.";
    }
    return message;
  }
  return "Something went wrong. Try again.";
}
