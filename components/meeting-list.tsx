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
 * One page of meetings as rows, newest first. When `total` needs more than one page, controls
 * below the list call `onPageChange` with the page to show. With `search`, they're search
 * results: the header counts matches, and an empty list says nothing matched (with a button
 * that calls `search.onClear`).
 */
export function MeetingList({
  meetings,
  total,
  page,
  pageSize,
  onDelete,
  onPageChange,
  changingPage = false,
  search,
}: {
  /** The meetings on this page. */
  meetings: Meeting[];
  /** How many meetings there are in all (or match the search), on any page. */
  total: number;
  /** The page shown, 1-based. */
  page: number;
  pageSize: number;
  onDelete: (id: string) => void;
  onPageChange: (page: number) => void;
  /** Set while another page loads. */
  changingPage?: boolean;
  /** Set when the list is filtered: the search text ("" if none) and whether filters are set. */
  search?: { query: string; filtered: boolean; onClear: () => void };
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A page past the end: its meetings were deleted, or the link is old.
  if (meetings.length === 0 && total > 0) {
    return (
      <div className={emptyState}>
        <p className={label}>Page {page}</p>
        <p className="mt-2 font-medium text-fg">This page doesn&rsquo;t exist</p>
        <p className="mt-1 text-sm text-muted">
          {search ? "The results" : "The meetings"} end on page {pageCount}.
        </p>
        <button
          type="button"
          onClick={() => onPageChange(pageCount)}
          className={`${buttonSecondary} mt-4`}
        >
          Go to page {pageCount}
        </button>
      </div>
    );
  }

  if (meetings.length === 0 && search) {
    const { query, filtered, onClear } = search;
    return (
      <div className={emptyState}>
        <p className={label}>No matches</p>
        <p className="mt-2 font-medium text-fg">
          {query ? (
            <>
              No meetings match &ldquo;{query}&rdquo;{filtered && " with these filters"}
            </>
          ) : (
            "No meetings match these filters"
          )}
        </p>
        <p className="mt-1 text-sm text-muted">
          {query
            ? "Search looks in meeting names, participants, notes, and tag names."
            : "Try a wider date range, or fewer tags or people."}
        </p>
        <button type="button" onClick={onClear} className={`${buttonSecondary} mt-4`}>
          {query && filtered ? "Clear search and filters" : query ? "Clear search" : "Clear filters"}
        </button>
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
        <h2 className={label}>{search ? "Search results" : "Meetings"}</h2>
        <span className="font-mono text-xs text-muted">
          {search ? `${total} ${total === 1 ? "match" : "matches"}` : `${total} total`}
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
      {pageCount > 1 && (
        <nav
          aria-label="Pages"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3"
        >
          <span className="font-mono text-xs text-muted">
            {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + meetings.length} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || changingPage}
              className={buttonSecondary}
            >
              ← Newer
            </button>
            <span className="font-mono text-xs text-muted" aria-live="polite">
              {changingPage ? "Loading…" : `Page ${page} of ${pageCount}`}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount || changingPage}
              className={buttonSecondary}
            >
              Older →
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
