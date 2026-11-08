import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TagsManager } from "@/components/tags-manager";
import { loadingText, pageMainNarrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Tags · Meeting log",
};

export default function TagsPage() {
  return (
    <main className={pageMainNarrow}>
      <PageHeader
        kicker="Taxonomy"
        title="Tags"
        description="Use tags to group meetings, e.g. by client, project, or type of meeting."
      />
      <Suspense fallback={<p className={loadingText}>Loading tags…</p>}>
        <TagsManager />
      </Suspense>
    </main>
  );
}
