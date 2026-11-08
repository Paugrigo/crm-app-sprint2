// Meetings, stored in Supabase (tables `meetings` and `meeting_tags`). Row Level Security limits
// every query to the signed-in user's rows. Browser-only: see lib/remote-store.ts.

import { getSupabase } from "./supabase/client";
import { createRemoteStore } from "./remote-store";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Returns the value as a Meeting, or null if it isn't one. Used for backup files. Meetings
 * saved before tags existed have no tagIds; they get an empty list.
 */
export function toMeeting(value: unknown): Meeting | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    typeof m.name !== "string" ||
    typeof m.date !== "string" ||
    !isStringArray(m.participants) ||
    typeof m.notes !== "string"
  ) {
    return null;
  }
  return {
    id: m.id,
    name: m.name,
    date: m.date,
    participants: m.participants,
    notes: m.notes,
    tagIds: isStringArray(m.tagIds) ? m.tagIds : [],
  };
}

/** Valid meetings from a parsed JSON array, skipping anything that isn't one. */
export function toMeetings(values: unknown[]): Meeting[] {
  return values.map(toMeeting).filter((m): m is Meeting => m !== null);
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

const store = createRemoteStore(fetchMeetings);

/** The signed-in user's meetings, newest first. Suspends until loaded. */
export const useMeetings = store.useValue;

/** Reloads meetings from Supabase (e.g. after tags change). */
export const refreshMeetings = store.refresh;

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
    await store.refresh().catch(() => {});
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
    await store.refresh().catch(() => {});
  }
}

/** Deletes a meeting (its tag links go with it). Throws if deleting fails. */
export async function deleteMeeting(id: string) {
  try {
    const { error } = await getSupabase().from("meetings").delete().eq("id", id);
    if (error) throw error;
  } finally {
    await store.refresh().catch(() => {});
  }
}
