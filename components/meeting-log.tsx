"use client";

import { useSearchParams } from "next/navigation";
import { use, useDeferredValue, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import {
  NO_FILTERS,
  readMeetingFilters,
  readMeetingPage,
  SEARCH_MAX_LENGTH,
  toMeetingSearch,
  writeMeetingFilters,
  writeMeetingPage,
  type MeetingFilters,
  type MeetingSearch,
} from "@/lib/meeting-filters";
import { deleteMeeting, MEETINGS_PAGE_SIZE, useMeetingPage } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { useTags } from "@/lib/tags";
import { MeetingFilterBar } from "./meeting-filter-bar";
import { MeetingList } from "./meeting-list";
import { errorBox, iconButton, input } from "./ui";

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

  const params = useSearchParams();
  const urlFilters = readMeetingFilters(params);
  const page = readMeetingPage(params);
  // Ignore tags that no longer exist (e.g. deleted since the link was bookmarked).
  const tags = useTags();
  const filters: MeetingFilters = {
    ...urlFilters,
    tagIds: urlFilters.tagIds.filter((id) => tags.some((t) => t.id === id)),
  };
  const search = toMeetingSearch(filters);
  const searchKey = JSON.stringify(search);
  // While the next results load, keep showing the current ones (dimmed) instead of the
  // Suspense fallback. Compared as JSON, since a new object is built on every render.
  const pageKey = JSON.stringify({ search, page });
  const shownKey = useDeferredValue(pageKey);
  const shown = JSON.parse(shownKey) as { search: MeetingSearch; page: number };
  const loading = shownKey !== pageKey;
  // Loading because the search changed (not only the page): the search box says so.
  const searching = loading && JSON.stringify(shown.search) !== searchKey;
  const topRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Clear all": remounts the search box, which drops text typed but not yet searched
  // and its pending debounce timer (that would otherwise write the text back into the URL).
  const [searchBoxKey, setSearchBoxKey] = useState(0);

  function clearAll() {
    setSearchBoxKey((key) => key + 1);
    writeMeetingFilters(NO_FILTERS);
  }

  function goToPage(next: number) {
    writeMeetingPage(next);
    // The page controls sit below the list; start reading the new page from its top.
    topRef.current?.scrollIntoView({ block: "start" });
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
    <section ref={topRef}>
      <SearchBox key={searchBoxKey} urlQuery={filters.query} loading={searching} />
      <MeetingFilterBar filters={filters} onChange={updateFilters} onClearAll={clearAll} />
      {error && (
        <p role="alert" className={`${errorBox} mb-4`}>
          {error}
        </p>
      )}
      <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
        <Results
          search={shown.search}
          page={shown.page}
          onDelete={handleDelete}
          onClear={clearAll}
          onPageChange={goToPage}
          changingPage={loading && !searching}
        />
      </div>
    </section>
  );
}

/**
 * One page of the meetings matching the search, as returned by the database (all meetings
 * when nothing is searched or filtered).
 */
function Results({
  search,
  page,
  onDelete,
  onClear,
  onPageChange,
  changingPage,
}: {
  search: MeetingSearch;
  page: number;
  onDelete: (id: string) => void;
  onClear: () => void;
  onPageChange: (page: number) => void;
  changingPage: boolean;
}) {
  const { meetings, total } = useMeetingPage(search, page);
  return (
    <MeetingList
      meetings={meetings}
      total={total}
      page={page}
      pageSize={MEETINGS_PAGE_SIZE}
      onDelete={onDelete}
      onPageChange={onPageChange}
      changingPage={changingPage}
      search={
        isFiltered(search)
          ? { query: search.query, filtered: isFiltered({ ...search, query: "" }), onClear }
          : undefined
      }
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

  const inputRef = useRef<HTMLInputElement>(null);

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
        ref={inputRef}
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
        // The browser's own clear button is hidden: it sat wherever the right padding ended.
        // Ours below stays at the right edge. The right padding always leaves room for
        // "Searching…" (plus the clear button once there's text), so typed text doesn't shift
        // each time a search starts and ends.
        className={`${input} pl-9 ${text ? "pr-32" : "pr-24"} [&::-webkit-search-cancel-button]:appearance-none`}
      />
      {loading && (
        <span
          role="status"
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 font-mono text-xs text-faint ${
            text ? "right-10" : "right-3"
          }`}
        >
          Searching…
        </span>
      )}
      {text && (
        <button
          type="button"
          onClick={() => {
            search("", 0);
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          title="Clear search"
          className={`${iconButton} absolute right-1.5 top-1/2 -translate-y-1/2`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </form>
  );
}
