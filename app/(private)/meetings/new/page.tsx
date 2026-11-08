import type { Metadata } from "next";
import { Suspense } from "react";
import { NewMeeting } from "@/components/new-meeting";
import { PageHeader } from "@/components/page-header";
import { loadingText, pageMainNarrow, panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Log a meeting · Meeting log",
};

export default function NewMeetingPage() {
  return (
    <main className={pageMainNarrow}>
      <PageHeader
        kicker="New entry"
        title="Log a meeting"
        description="Record who you met, when, and what was discussed."
      />
      <section className={`${panel} p-5`}>
        <Suspense fallback={<p className={loadingText}>Loading form…</p>}>
          <NewMeeting />
        </Suspense>
      </section>
    </main>
  );
}
