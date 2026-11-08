// An in-memory copy of data loaded from Supabase, shared by every component that reads it.
// Supabase is the source of truth: after each create, edit, or delete, the caller refetches
// with refresh(), and every subscribed component re-renders.
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

/** Refetch when the tab becomes visible again, at most this often, to pick up other tabs' changes. */
const FOCUS_REFRESH_INTERVAL_MS = 30_000;

export type RemoteStore<T> = {
  /** The current data. Suspends until the first load finishes; throws if it fails. */
  useValue: () => T;
  /** Reloads the data from Supabase and notifies subscribers. Rejects if loading fails. */
  refresh: () => Promise<void>;
};

export function createRemoteStore<T>(load: () => Promise<T>): RemoteStore<T> {
  let value: T | undefined;
  let loaded = false;
  let firstLoad: Promise<void> | null = null;
  let lastLoadedAt = 0;
  const listeners = new Set<() => void>();

  async function refresh() {
    value = await load();
    loaded = true;
    lastLoadedAt = Date.now();
    listeners.forEach((listener) => listener());
  }

  function ensureLoaded(): Promise<void> {
    // Loaded by a refresh() before any component read it: hand use() a promise React already
    // knows is fulfilled, so it doesn't suspend.
    if (loaded && !firstLoad) firstLoad = fulfilledPromise();
    firstLoad ??= refresh().catch((error: unknown) => {
      // Let the next render (e.g. the error page's "Try again") start a fresh attempt.
      firstLoad = null;
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
    if (listeners.size === 0) document.addEventListener("visibilitychange", handleVisibilityChange);
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

  return { useValue, refresh };
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
