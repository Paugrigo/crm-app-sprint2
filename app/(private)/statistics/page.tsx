import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Statistics } from "@/components/statistics";
import { loadingText, pageMain } from "@/components/ui";

export const metadata: Metadata = {
  title: "Statistics · Meeting log",
};

export default function StatisticsPage() {
  return (
    <main className={pageMain}>
      <PageHeader
        kicker="Analytics"
        title="Statistics"
        description="An overview of the meetings you've logged, up to today."
      />
      <Suspense fallback={<p className={loadingText}>Loading statistics…</p>}>
        <Statistics />
      </Suspense>
    </main>
  );
}
