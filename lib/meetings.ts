// Meetings, stored in Supabase (tables `meetings` and `meeting_tags`). Row Level Security limits
// every query to the signed-in user's rows. Browser-only: see lib/remote-store.ts.

import type { MeetingSearch } from "./meeting-filters";
import { fetchAllPages } from "./supabase/fetch-all";
import { getSupabase } from "./supabase/client";
import { createKeyedRemoteStore, createRemoteStore, invalidate } from "./remote-store";

export type Meeting = {
  id: string;
  name: string;
  /** Calendar date as YYYY-MM-DD (the value of <input type="date">). */
  date: string;
  participants: string[];
  notes: string;
  /** IDs of the meeting's tags (see lib/tags.ts). */
  tagIds: string[];
};

export type MeetingDraft = Omit<Meeting, "id">;

// Same limits as the check constraints on `meetings` in
// supabase/migrations/20261108120000_initial_schema.sql. Change both together.
/** Longest meeting name, counted after trimming (the database trims before checking). */
export const MEETING_NAME_MAX_LENGTH = 200;
/** Longest notes text. */
export const MEETING_NOTES_MAX_LENGTH = 20000;

/** Whether `value` is a real calendar date written as YYYY-MM-DD. */
function isDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Returns the value as a Meeting, or null if it isn't one or the database would reject it (blank
 * or too-long name, too-long notes, invalid date). Used for backup files. Meetings saved before
 * tags existed have no tagIds; they get an empty list.
 */
export function toMeeting(value: unknown): Meeting | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    typeof m.name !== "string" ||
    !m.name.trim() ||
    m.name.trim().length > MEETING_NAME_MAX_LENGTH ||
    typeof m.date !== "string" ||
    !isDateString(m.date) ||
    !isStringArray(m.participants) ||
    typeof m.notes !== "string" ||
    m.notes.length > MEETING_NOTES_MAX_LENGTH
  ) {
    return null;
  }
  return {
    id: m.id,
    name: m.name.trim(),
    date: m.date,
    // Trimmed like the meeting form does, so names compare equal in search filters.
    participants: m.participants.map((p) => p.trim()).filter(Boolean),
    notes: m.notes,
    tagIds: isStringArray(m.tagIds) ? m.tagIds : [],
  };
}

type MeetingRow = {
  id: string;
  name: string;
  date: string;
  participants: string[];
  notes: string;
  meeting_tags: { tag_id: string }[];
};

const MEETING_COLUMNS = "id, name, date, participants, notes, meeting_tags(tag_id)";

function fromRow(row: MeetingRow): Meeting {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    participants: row.participants,
    notes: row.notes,
    tagIds: row.meeting_tags.map((link) => link.tag_id),
  };
}

// Nothing below loads the whole meetings table into one store: each page reads only what it
// shows (one meeting, the 8 most recent, a page of the log, counts), so a user with thousands of
// meetings doesn't download all of them on every page. Where every row is needed (statistics,
// export), it is read page by page (fetchAllPages): a plain select stops at the API's row limit.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` looks like a database ID. Querying with anything else is a database error. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Newest first, like the meeting log. The ID breaks ties, so pages never overlap or skip. */
function newestFirst<Q extends { order: (column: string, options?: { ascending?: boolean }) => Q }>(
  query: Q,
): Q {
  return query.order("date", { ascending: false }).order("created_at", { ascending: false }).order("id");
}

async function fetchMeeting(id: string): Promise<Meeting | null> {
  // Not an ID at all (e.g. a mistyped URL): no meeting has it.
  if (!isUuid(id)) return null;
  const { data, error } = await getSupabase()
    .from("meetings")
    .select(MEETING_COLUMNS)
    .eq("id", id)
    .maybeSingle<MeetingRow>();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

const meetingStore = createKeyedRemoteStore(fetchMeeting, { tables: ["meetings", "meeting_tags"] });

/**
 * One meeting by ID, or null if there's none: unknown IDs and other users' meetings (which RLS
 * hides) look the same. Suspends until loaded.
 */
export function useMeeting(id: string): Meeting | null {
  return meetingStore.useValue(id);
}

export type RecentMeeting = Pick<Meeting, "id" | "name" | "date">;

/** How many meetings the sidebar lists. */
export const RECENT_MEETINGS_LIMIT = 8;

async function fetchRecentMeetings(): Promise<RecentMeeting[]> {
  const { data, error } = await newestFirst(
    getSupabase().from("meetings").select("id, name, date"),
  )
    .limit(RECENT_MEETINGS_LIMIT)
    .returns<RecentMeeting[]>();
  if (error) throw error;
  return data;
}

const recentStore = createRemoteStore(fetchRecentMeetings, { tables: ["meetings"] });

/** The signed-in user's most recent meetings (RECENT_MEETINGS_LIMIT), newest first. Suspends. */
export const useRecentMeetings = recentStore.useValue;

async function fetchMeetingCount(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("meetings")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

const countStore = createRemoteStore(fetchMeetingCount, { tables: ["meetings"] });

/** How many meetings the signed-in user has. Suspends until loaded. */
export const useMeetingCount = countStore.useValue;

/**
 * Meetings per page of the meeting log. Must stay at or below the API's max_rows (1000,
 * supabase/config.toml), since a page is one request.
 */
export const MEETINGS_PAGE_SIZE = 100;

/** One page of meetings matching a search, and how many match in total. */
export type MeetingPage = { meetings: Meeting[]; total: number };

/** PostgREST error code for a range that starts past the last row (e.g. a page that's gone). */
const RANGE_NOT_SATISFIABLE = "PGRST103";

function searchMeetingsQuery(search: MeetingSearch) {
  return getSupabase().rpc(
    "search_meetings",
    {
      search: search.query || null,
      tag_ids: search.tagIds.length > 0 ? search.tagIds : null,
      tags_match_all: search.tagsMatchAll,
      participants: search.people.length > 0 ? search.people : null,
      participants_match_all: search.peopleMatchAll,
      date_from: search.from || null,
      date_to: search.to || null,
    },
    // Always a POST: a `head` or `get` call sends the arguments in the URL, where null becomes
    // the text "null" (an invalid tag ID list), so the request fails.
    { count: "exact" },
  );
}

/**
 * Page `page` (1-based) of the meetings matching a search (text and filters), newest first,
 * found by the database (the search_meetings function; see supabase/migrations): only that
 * page's rows are downloaded. An empty search matches every meeting. Takes the key as JSON
 * because results are cached per search and page (see searchStore).
 */
async function searchMeetings(keyJson: string): Promise<MeetingPage> {
  const { search, page } = JSON.parse(keyJson) as { search: MeetingSearch; page: number };
  const from = (page - 1) * MEETINGS_PAGE_SIZE;
  const { data, error, count } = await newestFirst(
    searchMeetingsQuery(search)
      // PostgREST can only order a function's results by selected columns, so created_at is
      // selected here too (fromRow ignores it).
      .select(`${MEETING_COLUMNS}, created_at`),
  ).range(from, from + MEETINGS_PAGE_SIZE - 1);
  if (error?.code === RANGE_NOT_SATISFIABLE) {
    // The page starts past the last match (e.g. its meetings were deleted, or an old link):
    // no rows, but the total is still needed to offer the last page. Ask for one row to get it.
    const first = await searchMeetingsQuery(search).select("id").range(0, 0);
    if (first.error) throw first.error;
    return { meetings: [], total: first.count ?? 0 };
  }
  if (error) throw error;
  // Without generated database types, supabase-js can't tell that this function returns rows
  // (setof meetings) rather than one value, so the row type is asserted here.
  const meetings = (data as unknown as MeetingRow[]).map(fromRow);
  return { meetings, total: count ?? from + meetings.length };
}

// Reads tags too: the search text matches tag names.
const searchStore = createKeyedRemoteStore(searchMeetings, {
  tables: ["meetings", "meeting_tags", "tags"],
});

/**
 * Page `page` (1-based, MEETINGS_PAGE_SIZE per page) of the signed-in user's meetings matching
 * `search` (see lib/meeting-filters.ts), newest first, with the total number of matches.
 * Suspends until loaded.
 */
export function useMeetingPage(search: MeetingSearch, page: number): MeetingPage {
  return searchStore.useValue(JSON.stringify({ search, page }));
}

/** Every meeting of the signed-in user, newest first, read page by page. For backup export. */
export function fetchAllMeetings(): Promise<Meeting[]> {
  return fetchAllPages<MeetingRow>((from, to) =>
    newestFirst(getSupabase().from("meetings").select(MEETING_COLUMNS)).range(from, to),
  ).then((rows) => rows.map(fromRow));
}

/** IDs per request in fetchMeetingsByIds(): they go in the URL, which has a length limit. */
const IDS_PER_REQUEST = 100;

/**
 * The signed-in user's meetings with these IDs (others' and unknown IDs are simply not found).
 * IDs that aren't UUIDs can't be anyone's meeting and are skipped. For backup import.
 */
export async function fetchMeetingsByIds(ids: string[]): Promise<Meeting[]> {
  const uuids = [...new Set(ids.filter(isUuid))];
  const meetings: Meeting[] = [];
  for (let i = 0; i < uuids.length; i += IDS_PER_REQUEST) {
    const { data, error } = await getSupabase()
      .from("meetings")
      .select(MEETING_COLUMNS)
      .in("id", uuids.slice(i, i + IDS_PER_REQUEST))
      .returns<MeetingRow[]>();
    if (error) throw error;
    meetings.push(...data.map(fromRow));
  }
  return meetings;
}

/** What statistics need from a meeting (no names or notes, which can be long). */
export type StatisticsMeeting = Pick<Meeting, "date" | "participants" | "tagIds">;

async function fetchStatisticsMeetings(): Promise<StatisticsMeeting[]> {
  const rows = await fetchAllPages<Pick<MeetingRow, "date" | "participants" | "meeting_tags">>(
    (from, to) =>
      newestFirst(
        getSupabase().from("meetings").select("date, participants, meeting_tags(tag_id)"),
      ).range(from, to),
  );
  return rows.map((row) => ({
    date: row.date,
    participants: row.participants,
    tagIds: row.meeting_tags.map((link) => link.tag_id),
  }));
}

const statisticsStore = createRemoteStore(fetchStatisticsMeetings, {
  tables: ["meetings", "meeting_tags"],
});

/** Every meeting of the signed-in user, with only what statistics need. Suspends until loaded. */
export const useStatisticsMeetings = statisticsStore.useValue;

export type Participant = { name: string; meetings: number };

async function fetchParticipants(): Promise<Participant[]> {
  const { data, error } = await getSupabase().rpc("meeting_participants");
  if (error) throw error;
  // supabase-js can't tell the function's row type without generated database types.
  return data as unknown as Participant[];
}

const participantsStore = createRemoteStore(fetchParticipants, { tables: ["meetings"] });

/**
 * Everyone in the signed-in user's meetings with their meeting counts, worked out by the
 * database (meeting_participants; names that differ only in case or surrounding spaces count
 * once). Unsorted. Suspends until loaded.
 */
export const useParticipants = participantsStore.useValue;

/**
 * Creates (id null) or updates a meeting and sets its tags, in one database call (save_meeting,
 * see supabase/migrations): it either saves everything or nothing. Returns the meeting's ID.
 */
async function saveMeeting(id: string | null, draft: MeetingDraft): Promise<string> {
  try {
    const { data, error } = await getSupabase().rpc("save_meeting", {
      meeting_id: id,
      name: draft.name,
      date: draft.date,
      participants: draft.participants,
      notes: draft.notes,
      // Tag IDs that aren't the user's tags (e.g. deleted in another tab) are skipped.
      tag_ids: draft.tagIds,
    });
    if (error) throw error;
    return data as string;
  } finally {
    await invalidate("meetings", "meeting_tags");
  }
}

/** Saves a new meeting and returns its ID. Throws if saving fails; then nothing is saved. */
export function createMeeting(draft: MeetingDraft): Promise<string> {
  return saveMeeting(null, draft);
}

/**
 * Saves changes to a meeting, including which tags it has. Throws if saving fails (then nothing
 * changes), including when the meeting no longer exists.
 */
export async function updateMeeting(id: string, draft: MeetingDraft) {
  await saveMeeting(id, draft);
}

/** Deletes a meeting (its tag links go with it). Throws if deleting fails. */
export async function deleteMeeting(id: string) {
  try {
    const { error } = await getSupabase().from("meetings").delete().eq("id", id);
    if (error) throw error;
  } finally {
    // Deleting a meeting also deletes its meeting_tags rows (on delete cascade).
    await invalidate("meetings", "meeting_tags");
  }
}
