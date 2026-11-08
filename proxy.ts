import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Server-side gate for the whole app: signed-out visitors who open a private page are
// redirected to /sign-in before the page loads. See lib/supabase/proxy.ts.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Every path except Next.js build assets, image optimization, and static files.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
