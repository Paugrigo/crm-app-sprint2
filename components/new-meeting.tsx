"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { browser } from "react-dom";
import { createMeeting, type MeetingDraft } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { MeetingForm } from "./meeting-form";
import { errorBox } from "./ui";

// Browser-only: saving uses the signed-in user's Supabase session, and the form's default date
// must be the visitor's today, not the day the page was prerendered. Render inside <Suspense>.
export function NewMeeting() {
  use(browser("Meetings are saved to Supabase from the browser."));

  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function addMeeting(draft: MeetingDraft): Promise<boolean> {
    setError(null);
    try {
      const id = await createMeeting(draft);
      router.push(`/meetings/${id}`);
      return true;
    } catch (e) {
      setError(`Couldn't save your meeting. ${describeError(e)}`);
      return false;
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className={`${errorBox} mb-4`}>
          {error}
        </p>
      )}
      <MeetingForm onSubmit={addMeeting} />
    </>
  );
}
