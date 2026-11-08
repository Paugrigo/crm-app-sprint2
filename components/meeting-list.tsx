import Link from "next/link";
import { formatMeetingDate } from "@/lib/format-date";
import type { Meeting } from "@/lib/meetings";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { MeetingTags } from "./meeting-tags";
import { buttonPrimary, buttonSecondary, emptyState, label, panel, panelHeader } from "./ui";

/** Short weekday for a YYYY-MM-DD date, e.g. "Sat". */
function weekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * Meetings as rows, newest first. With `query`, they're search results: the header counts
 * matches, and an empty list says nothing matched (with a button that calls `onClearQuery`).
 */
export function MeetingList({
  meetings,
  onDelete,
  query,
  onClearQuery,
}: {
  meetings: Meeting[];
  onDelete: (id: string) => void;
  query?: string;
  onClearQuery?: () => void;
}) {
  if (meetings.length === 0 && query) {
    return (
      <div className={emptyState}>
        <p className={label}>No matches</p>
        <p className="mt-2 font-medium text-fg">
          No meetings match &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-sm text-muted">
          Search looks in meeting names, participants, notes, and tag names.
        </p>
        {onClearQuery && (
          <button type="button" onClick={onClearQuery} className={`${buttonSecondary} mt-4`}>
            Clear search
          </button>
        )}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className={emptyState}>
        <p className={label}>No data</p>
        <p className="mt-2 font-medium text-fg">No meetings logged yet</p>
        <p className="mt-1 text-sm text-muted">Log your first meeting and it will show up here.</p>
        <Link href="/meetings/new" className={`${buttonPrimary} mt-4`}>
          Log a meeting
        </Link>
      </div>
    );
  }

  // Newest first; ISO dates sort correctly as strings.
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className={`${panel} overflow-hidden`}>
      <div className={panelHeader}>
        <h2 className={label}>{query ? "Search results" : "Meetings"}</h2>
        <span className="font-mono text-xs text-muted">
          {query
            ? `${meetings.length} ${meetings.length === 1 ? "match" : "matches"}`
            : `${meetings.length} total`}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((meeting) => (
          // The title link stretches over the whole row (after:inset-0); the delete
          // button sits above it with z-10 so it stays clickable.
          <li
            key={meeting.id}
            className="relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[6.5rem_1fr_auto]"
          >
            <time
              dateTime={meeting.date}
              title={formatMeetingDate(meeting.date)}
              className="col-span-2 font-mono text-xs text-muted sm:col-span-1 sm:pt-0.5"
            >
              {meeting.date}
              <span className="ml-1.5 text-faint sm:ml-0 sm:block">{weekday(meeting.date)}</span>
            </time>
            <div className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1">
              <h3 className="truncate font-medium text-fg">
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/60"
                >
                  {meeting.name}
                </Link>
              </h3>
              {meeting.participants.length > 0 && (
                <p className="mt-0.5 truncate text-sm text-muted">
                  <span className="font-mono text-xs text-faint">
                    {meeting.participants.length} ×{" "}
                  </span>
                  {meeting.participants.join(", ")}
                </p>
              )}
              {meeting.notes && (
                <p className="mt-1 line-clamp-1 whitespace-pre-wrap text-sm text-faint">
                  {meeting.notes}
                </p>
              )}
              <MeetingTags tagIds={meeting.tagIds} className="mt-2" />
            </div>
            <div className="col-start-2 row-start-2 flex items-start sm:col-start-3 sm:row-start-1">
              <DeleteMeetingButton meeting={meeting} onDelete={onDelete} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
