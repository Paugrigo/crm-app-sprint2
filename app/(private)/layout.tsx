import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { ThemeApplier } from "@/components/theme-applier";
import { loadingText } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";

// Every page in this route group is private. proxy.ts already redirects signed-out visitors to
// /sign-in before the page loads; this server-side check is a second line of defense in case
// the proxy is skipped (e.g. a matcher change).
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    // Reading the session is request-time data, so with Cache Components it must sit inside
    // <Suspense>.
    <Suspense
      fallback={<p className={`${loadingText} m-auto p-8`}>Loading…</p>}
    >
      <RequireUser>{children}</RequireUser>
    </Suspense>
  );
}

async function RequireUser({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <>
      <Sidebar email={user.email} />
      <ThemeApplier />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
}
