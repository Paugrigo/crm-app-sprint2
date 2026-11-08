import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Settings } from "@/components/settings";
import { loadingText, pageMainNarrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Settings · Meeting log",
};

export default function SettingsPage() {
  return (
    <main className={pageMainNarrow}>
      <PageHeader kicker="System" title="Settings" />
      <Suspense fallback={<p className={loadingText}>Loading settings…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}
