import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Pages a signed-out visitor may open. Everything else is private. */
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth/confirm"];
/** Pages a signed-in visitor has no use for; they go to the meeting log instead. */
const SIGNED_OUT_ONLY_PATHS = ["/sign-in", "/sign-up"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Runs on the server before every page request (see proxy.ts): refreshes the Supabase
 * session cookies, redirects signed-out visitors on private pages to /sign-in, and sends
 * signed-in visitors away from the sign-in and sign-up pages.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Pass refreshed cookies on to the page being rendered, and back to the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Cache-Control: no-store etc., so a response carrying one user's session cookies
        // is never cached and served to someone else.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Don't run code between createServerClient and getClaims(): getClaims() is what refreshes
  // an expired session. It also verifies the token, unlike getSession().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  function redirectTo(url: URL): NextResponse {
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(url);
  }

  if (signedIn && matches(pathname, SIGNED_OUT_ONLY_PATHS)) {
    return redirectTo(new URL("/", request.url));
  }

  return response;
}
