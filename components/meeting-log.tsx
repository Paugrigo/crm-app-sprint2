"use client";

import { use, useState } from "react";
import { browser } from "react-dom";
import { deleteMeeting, useMeetings } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { MeetingList } from "./meeting-list";
import { errorBox } from "./ui";

// Browser-only: meetings are loaded from Supabase with the signed-in user's session.
// Render inside a <Suspense> boundary.
export function MeetingLog() {
  use(browser("Meetings are loaded from Supabase in the browser."));

  const meetings = useMeetings();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteMeeting(id);
    } catch (e) {
      setError(`Couldn't delete the meeting. ${describeError(e)}`);
    }
  }

  return (
    <section>
      {error && (
        <p role="alert" className={`${errorBox} mb-4`}>
          {error}
        </p>
      )}
      <MeetingList meetings={meetings} onDelete={handleDelete} />
    </section>
  );
}
