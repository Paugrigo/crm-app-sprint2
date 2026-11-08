"use client";

import { describeError } from "@/lib/remote-store";
import { buttonPrimary, emptyState, label, pageMain } from "@/components/ui";

// Shown when a page or the sidebar fails to load its data from Supabase (e.g. offline, or the
// session expired in another tab). "No blank screens": always a readable message and a way on.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className={pageMain}>
      <div className={`${emptyState} mx-auto max-w-2xl py-12`}>
        <p className={label}>Error</p>
        <h1 className="mt-2 text-xl font-semibold text-fg">Couldn&apos;t load your data</h1>
        <p className="mt-2 text-sm text-muted">{describeError(error)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => retry()} className={buttonPrimary}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
