import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers. Create a new one
 * per request (it holds that request's cookies).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies. That's fine: proxy.ts refreshes the session
          // cookies on every request before the page renders.
        }
      },
    },
  });
}

/** The signed-in user's ID and email, verified on the server, or null if signed out. */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  // Checking the session compares its expiry with the current time (Date.now()), so it must
  // never run while Next.js prerenders; this marks it as request-time only.
  await connection();
  const supabase = await createClient();
  // getClaims() verifies the session token's signature. Never trust getSession() on the
  // server: it reads the cookie without verifying it.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}
