import Link from "next/link";
import { Suspense } from "react";
import { MeetingDetail } from "@/components/meeting-detail";
import { loadingText, pageMain } from "@/components/ui";

export default function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  return (
    <main className={pageMain}>
      <nav className="mb-4">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wider text-muted hover:text-accent-fg"
        >
          ← All meetings
        </Link>
      </nav>
      {/* Meeting IDs are only known at runtime, so params are read inside Suspense. */}
      <Suspense fallback={<p className={loadingText}>Loading meeting…</p>}>
        {params.then(({ id }) => (
          <MeetingDetail id={id} />
        ))}
      </Suspense>
    </main>
  );
}
