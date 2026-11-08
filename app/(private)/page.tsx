import Link from "next/link";
import { Suspense } from "react";
import { MeetingLog } from "@/components/meeting-log";
import { PageHeader } from "@/components/page-header";
import { buttonPrimary, loadingText, pageMain } from "@/components/ui";

export default function Home() {
  return (
    <main className={pageMain}>
      <PageHeader
        kicker="Ledger"
        title="Meeting log"
        description="Every meeting you've logged, newest first."
        actions={
          <Link href="/meetings/new" className={buttonPrimary}>
            + Log a meeting
          </Link>
        }
      />
      <Suspense fallback={<p className={loadingText}>Loading meetings…</p>}>
        <MeetingLog />
      </Suspense>
    </main>
  );
}
