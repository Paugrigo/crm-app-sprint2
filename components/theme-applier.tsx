"use client";

import { Suspense, use, useEffect } from "react";
import { browser } from "react-dom";
import { applyTheme, useThemePreference } from "@/lib/theme";

/** Applies the signed-in user's saved theme to the page. Renders nothing. */
export function ThemeApplier() {
  return (
    <Suspense fallback={null}>
      <ApplyTheme />
    </Suspense>
  );
}

function ApplyTheme() {
  use(browser("The theme is loaded from Supabase in the browser."));
  const theme = useThemePreference();
  useEffect(() => applyTheme(theme), [theme]);
  return null;
}
