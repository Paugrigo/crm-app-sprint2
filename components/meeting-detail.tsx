"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useLayoutEffect, useState } from "react";
import { browser } from "react-dom";
import { formatMeetingDate } from "@/lib/format-date";
import { deleteMeeting, updateMeeting, useMeetings, type MeetingDraft } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { MeetingForm } from "./meeting-form";
import { MeetingTags } from "./meeting-tags";
import {
  buttonPrimary,
  buttonSecondary,
  emptyState,
  errorBox,
  label,
  panel,
  panelHeader,
} from "./ui";

const fieldRow = "grid gap-1.5 px-5 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4";

// Browser-only: meetings are loaded from Supabase with the signed-in user's session. Row Level
// Security means another user's meeting ID simply isn't found. Render inside <Suspense>.
export function MeetingDetail({ id }: { id: string }) {
  use(browser("Meetings are loaded from Supabase in the browser."));

  const router = useRouter();
  const meetings = useMeetings();
  const meeting = meetings.find((m) => m.id === id);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState(false);

  // Next.js keeps this page alive (hidden) after navigating away. Reset when it's hidden so
  // returning with the browser's back button shows "not found" rather than a blank page,
  // and doesn't reopen an abandoned edit with values that may since have changed.
  useLayoutEffect(
    () => () => {
      setDeleted(false);
      setEditing(false);
      setError(null);
    },
    [],
  );

  async function saveChanges(draft: MeetingDraft): Promise<boolean> {
    if (!meeting) return false;
    setError(null);
    try {
      await updateMeeting(id, draft, meeting.tagIds);
      setEditing(false);
      return true;
    } catch (e) {
      setError(`Couldn't save your changes. ${describeError(e)}`);
      return false;
    }
  }

  async function handleDelete(meetingId: string) {
    setError(null);
    // Set before deleting: the refetch afterwards no longer has this meeting.
    setDeleted(true);
    try {
      await deleteMeeting(meetingId);
      router.push("/");
    } catch (e) {
      setDeleted(false);
      setError(`Couldn't delete the meeting. ${describeError(e)}`);
    }
  }

  // Render nothing while navigating home after a delete, instead of flashing "not found".
  if (!meeting && deleted) return null;

  if (!meeting) {
    return (
      <div className={emptyState}>
        <title>Meeting not found · Meeting log</title>
        <p className={label}>Not found</p>
        <p className="mt-2 font-medium text-fg">Meeting not found</p>
        <p className="mt-1 text-sm text-muted">
          It may have been deleted, or the link is wrong.
        </p>
        <Link href="/" className={`${buttonPrimary} mt-4`}>
          Go to meeting log
        </Link>
      </div>
    );
  }

  return (
    <article className={`${panel} overflow-hidden`}>
      {/* React hoists <title> into <head>, so bookmarks get the meeting's name. */}
      <title>{`${meeting.name} · Meeting log`}</title>

      {error && (
        <p role="alert" className={`${errorBox} m-4 mb-0`}>
          {error}
        </p>
      )}

      {editing ? (
        <>
          <div className={panelHeader}>
            <h1 className={label}>Edit meeting</h1>
          </div>
          <div className="p-5">
            <MeetingForm
              initial={meeting}
              submitLabel="Save changes"
              onSubmit={saveChanges}
              onCancel={() => {
                setEditing(false);
                setError(null);
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wider text-accent-fg">
                Meeting
              </p>
              <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-fg">
                {meeting.name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setError(null);
                }}
                aria-label={`Edit ${meeting.name}`}
                title="Edit meeting"
                className={buttonSecondary}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5ZM11.5 5.5l3 3" />
                </svg>
                Edit
              </button>
              <DeleteMeetingButton meeting={meeting} onDelete={handleDelete} />
            </div>
          </div>

          {/* Key-value grid: mono keys on the left, values on the right (stacked on phones). */}
          <dl className="divide-y divide-line">
            <div className={fieldRow}>
              <dt className={label}>Date</dt>
              <dd>
                <time
                  dateTime={meeting.date}
                  title={formatMeetingDate(meeting.date)}
                  className="font-mono text-sm text-fg"
                >
                  {meeting.date}
                </time>
              </dd>
            </div>
            <div className={fieldRow}>
              <dt className={label}>Participants</dt>
              <dd>
                {meeting.participants.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {meeting.participants.map((participant) => (
                      <li
                        key={participant}
                        className="rounded-sm border border-line bg-surface-2 px-2 py-0.5 text-sm text-fg"
                      >
                        {participant}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-faint">No participants added.</p>
                )}
              </dd>
            </div>
            <div className={fieldRow}>
              <dt className={label}>Tags</dt>
              <dd>
                <MeetingTags tagIds={meeting.tagIds} emptyMessage="No tags." />
              </dd>
            </div>
            <div className={fieldRow}>
              <dt className={label}>Notes</dt>
              <dd>
                {meeting.notes ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                    {meeting.notes}
                  </p>
                ) : (
                  <p className="text-sm text-faint">No notes.</p>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </article>
  );
}
