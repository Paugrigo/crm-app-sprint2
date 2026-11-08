// Theme preference, stored per user in Supabase (table `user_settings`; no row means "system")
// and applied as a data-theme attribute on <html>: "light" or "dark" force that theme; "system"
// removes the attribute so CSS follows the OS. Browser-only: see lib/remote-store.ts.
//
// To avoid a flash of the wrong theme on page load, the choice is also copied into a cookie that
// an inline script reads before the first paint (see lib/theme-cookie.ts).

import { createRemoteStore } from "./remote-store";
import { readThemeCookie, writeThemeCookie } from "./theme-cookie";
import { getSupabase } from "./supabase/client";

export type ThemePreference = "light" | "dark" | "system";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * If loading fails, falls back to the cookie copy (the last theme this browser loaded): a
 * missing theme shouldn't break the page, and a brief network error shouldn't reset the
 * user's choice to "system".
 */
async function fetchThemePreference(): Promise<ThemePreference> {
  const { data, error } = await getSupabase()
    .from("user_settings")
    .select("theme")
    .maybeSingle<{ theme: string }>();
  if (error) {
    console.error("Couldn't load the theme preference:", error);
    return readThemeCookie();
  }
  return isThemePreference(data?.theme) ? data.theme : "system";
}

const store = createRemoteStore(fetchThemePreference);

/** The signed-in user's theme preference. Suspends until loaded. */
export const useThemePreference = store.useValue;

/** Applies the preference to the page and updates the cookie copy used on the next page load. */
export function applyTheme(preference: ThemePreference) {
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
  writeThemeCookie(preference);
}

/** Applies the preference right away and saves it. Throws if saving fails. */
export async function saveThemePreference(preference: ThemePreference) {
  applyTheme(preference);
  try {
    const { error } = await getSupabase()
      .from("user_settings")
      .upsert({ theme: preference }, { onConflict: "user_id" });
    if (error) throw error;
  } finally {
    await store.refresh().catch(() => {});
  }
}
