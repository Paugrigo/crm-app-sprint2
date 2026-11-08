// A copy of the signed-in user's theme choice in a cookie, so the right theme applies before
// the first paint (Supabase can't be asked until after the page has loaded). Supabase's
// `user_settings` stays the source of truth: lib/theme.ts rewrites this cookie whenever the
// preference loads or changes, and signing out deletes it. Holds only "light" or "dark"; no
// cookie means "system".

export const THEME_COOKIE = "crm-theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Inlined into <head> by the root layout; runs before the first paint on every full page load.
 * Keep it in sync with applyTheme() in lib/theme.ts.
 */
export const THEME_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

/** Writes the cookie in the browser ("system" removes it). */
export function writeThemeCookie(preference: "light" | "dark" | "system") {
  document.cookie =
    preference === "system"
      ? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${THEME_COOKIE}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
