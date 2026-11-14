// Meetings, stored in Supabase (tables `meetings` and `meeting_tags`). Row Level Security limits
// every query to the signed-in user's rows. Browser-only: see lib/remote-store.ts.

import type { MeetingSearch } from "./meeting-filters";
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

async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await getSupabase()
    .from("meetings")
    .select(MEETING_COLUMNS)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<MeetingRow[]>();
  if (error) throw error;
  return data.map(fromRow);
}

// Reads meeting_tags too: each meeting carries its tag IDs.
const store = createRemoteStore(fetchMeetings, { tables: ["meetings", "meeting_tags"] });

/** The signed-in user's meetings, newest first. Suspends until loaded. */
export const useMeetings = store.useValue;

/**
 * Meetings matching a search (text and filters), newest first, found by the database (the
 * search_meetings function; see supabase/migrations): only the matching rows are downloaded.
 * Takes the search as JSON because the results are cached per search (see searchStore).
 */
async function searchMeetings(searchJson: string): Promise<Meeting[]> {
  const search = JSON.parse(searchJson) as MeetingSearch;
  const { data, error } = await getSupabase()
    .rpc("search_meetings", {
      search: search.query || null,
      tag_ids: search.tagIds.length > 0 ? search.tagIds : null,
      tags_match_all: search.tagsMatchAll,
      participants: search.people.length > 0 ? search.people : null,
      participants_match_all: search.peopleMatchAll,
      date_from: search.from || null,
      date_to: search.to || null,
    })
    // PostgREST can only order a function's results by selected columns, so created_at is
    // selected here too (fromRow ignores it).
    .select(`${MEETING_COLUMNS}, created_at`)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Without generated database types, supabase-js can't tell that this function returns rows
  // (setof meetings) rather than one value, so the row type is asserted here.
  return (data as unknown as MeetingRow[]).map(fromRow);
}

// Reads tags too: the search text matches tag names.
const searchStore = createKeyedRemoteStore(searchMeetings, {
  tables: ["meetings", "meeting_tags", "tags"],
});

/**
 * The signed-in user's meetings matching `search` (see lib/meeting-filters.ts), newest first.
 * Suspends until loaded.
 */
export function useMeetingSearch(search: MeetingSearch): Meeting[] {
  return searchStore.useValue(JSON.stringify(search));
}

function meetingColumns(draft: MeetingDraft) {
  return {
    name: draft.name,
    date: draft.date,
    participants: draft.participants,
    notes: draft.notes,
  };
}

async function linkTags(meetingId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const { error } = await getSupabase()
    .from("meeting_tags")
    .insert(tagIds.map((tagId) => ({ meeting_id: meetingId, tag_id: tagId })));
  if (error) throw error;
}

async function unlinkTags(meetingId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const { error } = await getSupabase()
    .from("meeting_tags")
    .delete()
    .eq("meeting_id", meetingId)
    .in("tag_id", tagIds);
  if (error) throw error;
}

/**
 * Saves a new meeting and returns its ID. Throws if saving fails, and then nothing is saved:
 * if linking the tags fails, the new meeting is deleted again, so trying once more doesn't
 * create a duplicate.
 */
export async function createMeeting(draft: MeetingDraft): Promise<string> {
  try {
    const { data, error } = await getSupabase()
      .from("meetings")
      .insert(meetingColumns(draft))
      .select("id")
      .single();
    if (error) throw error;
    try {
      await linkTags(data.id, draft.tagIds);
    } catch (linkError) {
      await getSupabase().from("meetings").delete().eq("id", data.id);
      throw linkError;
    }
    return data.id;
  } finally {
    await invalidate("meetings", "meeting_tags");
  }
}

/** The meeting's tag IDs as saved right now (not the in-memory copy, which may be stale). */
async function savedTagIds(meetingId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("meeting_tags")
    .select("tag_id")
    .eq("meeting_id", meetingId)
    .returns<{ tag_id: string }[]>();
  if (error) throw error;
  return data.map((link) => link.tag_id);
}

/**
 * Saves changes to a meeting, including which tags it has. Throws if saving fails. Tag changes
 * are worked out against the saved links, so saving again after a failure (or after another
 * tab changed the tags) finishes the job instead of failing on links that already exist.
 */
export async function updateMeeting(id: string, draft: MeetingDraft) {
  try {
    const { error } = await getSupabase().from("meetings").update(meetingColumns(draft)).eq("id", id);
    if (error) throw error;
    const previousTagIds = await savedTagIds(id);
    await unlinkTags(id, previousTagIds.filter((tagId) => !draft.tagIds.includes(tagId)));
    await linkTags(id, draft.tagIds.filter((tagId) => !previousTagIds.includes(tagId)));
  } finally {
    await invalidate("meetings", "meeting_tags");
  }
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
