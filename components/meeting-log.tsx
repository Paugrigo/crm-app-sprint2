"use client";

import { useSearchParams } from "next/navigation";
import { use, useDeferredValue, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import {
  NO_FILTERS,
  readMeetingFilters,
  SEARCH_MAX_LENGTH,
  toMeetingSearch,
  writeMeetingFilters,
  type MeetingFilters,
  type MeetingSearch,
} from "@/lib/meeting-filters";
import { deleteMeeting, useMeetingSearch, useMeetings } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { useTags } from "@/lib/tags";
import { MeetingFilterBar } from "./meeting-filter-bar";
import { MeetingList } from "./meeting-list";
import { errorBox, input } from "./ui";

/** How long to wait after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;

/** Applies a change to the filters in the URL, starting from what the URL holds right now. */
function updateFilters(patch: Partial<MeetingFilters>) {
  writeMeetingFilters({
    ...readMeetingFilters(new URLSearchParams(window.location.search)),
    ...patch,
  });
}

function isFiltered(search: MeetingSearch): boolean {
  return Boolean(
    search.query || search.tagIds.length || search.people.length || search.from || search.to,
  );
}

// Browser-only: meetings are loaded from Supabase with the signed-in user's session.
// Render inside a <Suspense> boundary.
export function MeetingLog() {
  use(browser("Meetings are loaded from Supabase in the browser."));

  const urlFilters = readMeetingFilters(useSearchParams());
  // Ignore tags that no longer exist (e.g. deleted since the link was bookmarked).
  const tags = useTags();
  const filters: MeetingFilters = {
    ...urlFilters,
    tagIds: urlFilters.tagIds.filter((id) => tags.some((t) => t.id === id)),
  };
  const search = toMeetingSearch(filters);
  // While the next results load, keep showing the current ones (dimmed) instead of the
  // Suspense fallback. Compared as JSON, since a new object is built on every render.
  const searchKey = JSON.stringify(search);
  const shownKey = useDeferredValue(searchKey);
  const shown = JSON.parse(shownKey) as MeetingSearch;
  const loading = shownKey !== searchKey;
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Clear all": remounts the search box, which drops text typed but not yet searched
  // and its pending debounce timer (that would otherwise write the text back into the URL).
  const [searchBoxKey, setSearchBoxKey] = useState(0);

  function clearAll() {
    setSearchBoxKey((key) => key + 1);
    writeMeetingFilters(NO_FILTERS);
  }

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
      <SearchBox key={searchBoxKey} urlQuery={filters.query} loading={loading} />
      <MeetingFilterBar filters={filters} onChange={updateFilters} onClearAll={clearAll} />
      {error && (
        <p role="alert" className={`${errorBox} mb-4`}>
          {error}
        </p>
      )}
      <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
        {isFiltered(shown) ? (
          <SearchResults search={shown} onDelete={handleDelete} onClear={clearAll} />
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
function SearchResults({
  search,
  onDelete,
  onClear,
}: {
  search: MeetingSearch;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <MeetingList
      meetings={useMeetingSearch(search)}
      onDelete={onDelete}
      search={{
        query: search.query,
        filtered: isFiltered({ ...search, query: "" }),
        onClear,
      }}
    />
  );
}

function SearchBox({ urlQuery, loading }: { urlQuery: string; loading: boolean }) {
  const [text, setText] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can change without typing here (Back/Forward, "All meetings" in the menu, Clear
  // all): show its search text then. Adjusting state while rendering is React's pattern for
  // this; an effect would show the old text for a frame.
  const [shownUrlQuery, setShownUrlQuery] = useState(urlQuery);
  if (urlQuery !== shownUrlQuery) {
    setShownUrlQuery(urlQuery);
    if (urlQuery !== text.trim()) setText(urlQuery);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  // The search text this box last wrote into the URL. When the URL's text changes to something
  // else (Back/Forward, a link), a pending search is dropped so it can't overwrite that.
  const written = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery === written.current) return;
    clearTimeout(timer.current);
    written.current = urlQuery;
  }, [urlQuery]);

  function search(value: string, delay: number) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      written.current = value.trim();
      updateFilters({ query: value.trim() });
    }, delay);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        // Enter searches right away.
        event.preventDefault();
        search(text, 0);
      }}
      className="relative mb-3"
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
