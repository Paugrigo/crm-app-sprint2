"use client";

import { useSearchParams } from "next/navigation";
import { use, useDeferredValue, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import {
  deleteMeeting,
  SEARCH_MAX_LENGTH,
  useMeetingSearch,
  useMeetings,
} from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { MeetingList } from "./meeting-list";
import { errorBox, input } from "./ui";

/** How long to wait after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;

/** The search text in the URL (`?q=`), trimmed; "" when not searching. */
function useUrlQuery(): string {
  return (useSearchParams().get("q") ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
}

/** Puts the search text in the URL without a navigation or a new history entry per keystroke. */
function writeUrlQuery(query: string) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

// Browser-only: meetings are loaded from Supabase with the signed-in user's session.
// Render inside a <Suspense> boundary.
export function MeetingLog() {
  use(browser("Meetings are loaded from Supabase in the browser."));

  const urlQuery = useUrlQuery();
  // While the next results load, keep showing the current ones (dimmed) instead of the
  // Suspense fallback.
  const query = useDeferredValue(urlQuery);
  const loading = query !== urlQuery;
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
      <SearchBox urlQuery={urlQuery} loading={loading} />
      {error && (
        <p role="alert" className={`${errorBox} mb-4`}>
          {error}
        </p>
      )}
      <div
        aria-busy={loading}
        className={`transition-opacity ${loading ? "opacity-60" : ""}`}
      >
        {query ? (
          <SearchResults query={query} onDelete={handleDelete} />
        ) : (
          <AllMeetings onDelete={handleDelete} />
        )}
      </div>
    </section>
  );
}

function AllMeetings({ onDelete }: { onDelete: (id: string) => void }) {
  return <MeetingList meetings={useMeetings()} onDelete={onDelete} />;
}

/** Only the matching meetings, as returned by the database. */
function SearchResults({ query, onDelete }: { query: string; onDelete: (id: string) => void }) {
  return (
    <MeetingList
      meetings={useMeetingSearch(query)}
      onDelete={onDelete}
      query={query}
      onClearQuery={() => writeUrlQuery("")}
    />
  );
}

function SearchBox({ urlQuery, loading }: { urlQuery: string; loading: boolean }) {
  const [text, setText] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can change without typing here (Back/Forward, "All meetings" in the menu, Clear
  // search): show its search text then. Adjusting state while rendering is React's pattern
  // for this; an effect would show the old text for a frame.
  const [shownUrlQuery, setShownUrlQuery] = useState(urlQuery);
  if (urlQuery !== shownUrlQuery) {
    setShownUrlQuery(urlQuery);
    if (urlQuery !== text.trim()) setText(urlQuery);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(value: string, delay: number) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeUrlQuery(value.trim()), delay);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        // Enter searches right away.
        event.preventDefault();
        search(text, 0);
      }}
      className="relative mb-4"
    >
      <label htmlFor="meeting-search" className="sr-only">
        Search meetings
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m13 13 4 4" strokeLinecap="round" />
      </svg>
      <input
        id="meeting-search"
        type="search"
        value={text}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(event) => search(event.target.value, SEARCH_DELAY_MS)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            search("", 0);
          }
        }}
        placeholder="Search names, participants, notes, tags"
        autoComplete="off"
        spellCheck={false}
        className={`${input} pl-9 pr-24`}
      />
      {loading && (
        <span
          role="status"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-faint"
        >
          Searching…
        </span>
      )}
    </form>
  );
}
