// Search text and filters for the meeting log, kept in the URL so reloads, Back/Forward, and
// bookmarks keep them:
//
//   ?q=acme                 search text
//   &tag=<id>&tag=<id>      tags (by ID, so renaming a tag doesn't break the link)
//   &tags=all               the meeting needs all of those tags (default: any of them)
//   &person=Jonas&person=…  participants
//   &people=all             the meeting needs all of those people (default: any of them)
//   &date=this-month        a preset (this-month, this-year, upcoming, past), or
//   &from=2026-01-01&to=…   a custom range (either end optional)
//
// Pure functions; components read the URL with useSearchParams() and write it with
// writeMeetingFilters().

export const SEARCH_MAX_LENGTH = 200;

export const DATE_PRESETS = [
  { value: "this-month", label: "This month" },
  { value: "this-year", label: "This year" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past only" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export type DateFilter =
  | { kind: "any" }
  | { kind: "preset"; preset: DatePreset }
  | { kind: "range"; from: string; to: string };

export type MeetingFilters = {
  query: string;
  tagIds: string[];
  tagsMatchAll: boolean;
  people: string[];
  peopleMatchAll: boolean;
  date: DateFilter;
};

export const NO_FILTERS: MeetingFilters = {
  query: "",
  tagIds: [],
  tagsMatchAll: false,
  people: [],
  peopleMatchAll: false,
  date: { kind: "any" },
};

const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function readMeetingFilters(params: URLSearchParams): MeetingFilters {
  const preset = DATE_PRESETS.find((p) => p.value === params.get("date"))?.value;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  let date: DateFilter = { kind: "any" };
  if (preset) date = { kind: "preset", preset };
  else if (DATE_VALUE.test(from) || DATE_VALUE.test(to)) {
    date = { kind: "range", from: DATE_VALUE.test(from) ? from : "", to: DATE_VALUE.test(to) ? to : "" };
  }

  return {
    query: (params.get("q") ?? "").trim().slice(0, SEARCH_MAX_LENGTH),
    tagIds: unique(params.getAll("tag")),
    tagsMatchAll: params.get("tags") === "all",
    people: unique(params.getAll("person")),
    peopleMatchAll: params.get("people") === "all",
    date,
  };
}

/** Writes the filters into the current URL without a navigation or a new history entry. */
export function writeMeetingFilters(filters: MeetingFilters) {
  const url = new URL(window.location.href);
  for (const key of ["q", "tag", "tags", "person", "people", "date", "from", "to"]) {
    url.searchParams.delete(key);
  }
  const p = url.searchParams;
  if (filters.query) p.set("q", filters.query);
  filters.tagIds.forEach((id) => p.append("tag", id));
  if (filters.tagIds.length > 0 && filters.tagsMatchAll) p.set("tags", "all");
  filters.people.forEach((name) => p.append("person", name));
  if (filters.people.length > 0 && filters.peopleMatchAll) p.set("people", "all");
  if (filters.date.kind === "preset") p.set("date", filters.date.preset);
  if (filters.date.kind === "range") {
    if (filters.date.from) p.set("from", filters.date.from);
    if (filters.date.to) p.set("to", filters.date.to);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Whether anything narrows the list (otherwise the log shows all meetings). */
export function hasFilters(f: MeetingFilters): boolean {
  return Boolean(f.query) || f.tagIds.length > 0 || f.people.length > 0 || f.date.kind !== "any";
}

function toDateValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The inclusive date range for a filter, in the visitor's local calendar ("" = open end).
 * Presets are relative to `today`, so a bookmarked "This month" stays current.
 */
export function dateRange(date: DateFilter, today = new Date()): { from: string; to: string } {
  if (date.kind === "any") return { from: "", to: "" };
  if (date.kind === "range") return { from: date.from, to: date.to };
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (date.preset) {
    case "this-month":
      return { from: toDateValue(new Date(y, m, 1)), to: toDateValue(new Date(y, m + 1, 0)) };
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "upcoming":
      return { from: toDateValue(new Date(y, m, today.getDate() + 1)), to: "" };
    case "past":
      return { from: "", to: toDateValue(today) };
  }
}

/** What the database is asked for. Also the cache key for its results (as JSON). */
export type MeetingSearch = {
  query: string;
  tagIds: string[];
  tagsMatchAll: boolean;
  people: string[];
  peopleMatchAll: boolean;
  from: string;
  to: string;
};

export function toMeetingSearch(f: MeetingFilters, today = new Date()): MeetingSearch {
  const { from, to } = dateRange(f.date, today);
  return {
    query: f.query,
    // Sorted, so the same selection in another order reuses the cached results.
    tagIds: [...f.tagIds].sort(),
    tagsMatchAll: f.tagIds.length > 1 && f.tagsMatchAll,
    people: [...f.people].sort(),
    peopleMatchAll: f.people.length > 1 && f.peopleMatchAll,
    from,
    to,
  };
}

/** Short label for the date filter button, e.g. "This month" or "2026-01-01 – now". */
export function describeDate(date: DateFilter): string {
  if (date.kind === "any") return "Any time";
  if (date.kind === "preset") return DATE_PRESETS.find((p) => p.value === date.preset)!.label;
  if (date.from && date.to) return `${date.from} – ${date.to}`;
  if (date.from) return `From ${date.from}`;
  return `Until ${date.to}`;
}
