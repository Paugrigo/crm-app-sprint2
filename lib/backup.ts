// Backups: a JSON file of all the user's meetings and tags that they download and can import
// later (also how data from the old browser-only version of the app moves into Supabase).
// The format functions are pure; saveImport() writes a merge result to Supabase.

import { refreshMeetings, toMeetings, type Meeting } from "./meetings";
import { getSupabase } from "./supabase/client";
import { isTag, refreshTags, sameTagName, type Tag } from "./tags";

const BACKUP_FORMAT = "crm-meetings-backup";

export type BackupData = { meetings: Meeting[]; tags: Tag[] };

/** The contents of a backup file. Version 2 added tags. */
export function toBackup({ meetings, tags }: BackupData): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), meetings, tags },
    null,
    2,
  );
}

/**
 * Reads a backup file. Accepts version 1 files (no tags) and a bare array of meetings (the
 * raw localStorage format). Returns null if the file isn't a backup; skips invalid entries.
 */
export function fromBackup(text: string): BackupData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { meetings: toMeetings(parsed), tags: [] };
  if (typeof parsed !== "object" || parsed === null) return null;

  const { meetings, tags } = parsed as Record<string, unknown>;
  if (!Array.isArray(meetings)) return null;
  return {
    meetings: toMeetings(meetings),
    tags: Array.isArray(tags) ? tags.filter(isTag) : [],
  };
}

export type MergeResult = BackupData & {
  newMeetings: number;
  updatedMeetings: number;
  newTags: number;
};

/**
 * Merges imported data into the current data. Imported meetings and tags replace ones with
 * the same ID; everything else is kept. An imported tag whose name matches another tag (one
 * with a different ID) is merged into that tag, so importing never creates duplicate names.
 * That includes an existing tag that the backup renames to another tag's name: it is merged
 * too, and its meetings, here or in the backup, move to the other tag.
 */
export function mergeBackup(current: BackupData, imported: BackupData): MergeResult {
  // Tag IDs merged into another tag, mapped to that tag's ID. Other IDs stay as they are.
  const mergedTagIds = new Map<string, string>();
  function resolveTagId(id: string): string {
    // Follow chains: a tag can be merged into one that is itself merged later.
    let resolved = id;
    let next: string | undefined;
    while ((next = mergedTagIds.get(resolved)) !== undefined) resolved = next;
    return resolved;
  }

  const tagsById = new Map(current.tags.map((t) => [t.id, t]));
  let newTags = 0;
  for (const tag of imported.tags) {
    const sameName = [...tagsById.values()].find(
      (t) => t.id !== tag.id && sameTagName(t.name, tag.name),
    );
    if (sameName) {
      mergedTagIds.set(tag.id, sameName.id);
      tagsById.delete(tag.id);
    } else {
      if (!tagsById.has(tag.id)) newTags++;
      tagsById.set(tag.id, tag);
    }
  }

  function withMergedTags(meeting: Meeting): Meeting {
    return { ...meeting, tagIds: [...new Set(meeting.tagIds.map(resolveTagId))] };
  }

  const importedMeetings = imported.meetings.map(withMergedTags);
  const currentIds = new Set(current.meetings.map((m) => m.id));
  const importedById = new Map(importedMeetings.map((m) => [m.id, m]));
  const updatedMeetings = importedMeetings.filter((m) => currentIds.has(m.id)).length;

  return {
    meetings: [
      ...current.meetings.map((m) => importedById.get(m.id) ?? withMergedTags(m)),
      ...importedMeetings.filter((m) => !currentIds.has(m.id)),
    ],
    tags: [...tagsById.values()],
    newMeetings: importedMeetings.length - updatedMeetings,
    updatedMeetings,
    newTags,
  };
}

/** A UUID derived from `key` (SHA-256), so the same key always gives the same ID. */
async function derivedUuid(key: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8 (custom)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Gives the imported meetings and tags IDs that are safe to save for the signed-in user. Run it
 * before mergeBackup(). IDs are global in the database, so an imported item that isn't already
 * this user's would clash with another account that imported the same file (or the account it
 * was exported from), and old files may not even use UUIDs. Such IDs are replaced with one
 * derived from the user and the original ID, so importing the same file again still updates the
 * same items instead of duplicating them. IDs of the user's own items are kept.
 */
export async function localizeBackup(current: BackupData, imported: BackupData): Promise<BackupData> {
  const { data, error } = await getSupabase().auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) throw error ?? new Error("You're signed out. Reload the page to sign in again.");

  const ownIds = new Set([...current.meetings.map((m) => m.id), ...current.tags.map((t) => t.id)]);
  const cache = new Map<string, Promise<string>>();
  function localId(kind: "meeting" | "tag", id: string): Promise<string> {
    if (ownIds.has(id)) return Promise.resolve(id);
    const key = `${userId}:${kind}:${id}`;
    if (!cache.has(key)) cache.set(key, derivedUuid(key));
    return cache.get(key)!;
  }

  const [tags, meetings] = await Promise.all([
    Promise.all(imported.tags.map(async (t) => ({ ...t, id: await localId("tag", t.id) }))),
    Promise.all(
      imported.meetings.map(async (m) => ({
        ...m,
        id: await localId("meeting", m.id),
        tagIds: await Promise.all(m.tagIds.map((id) => localId("tag", id))),
      })),
    ),
  ]);
  return { meetings, tags };
}

function sameMeeting(a: Meeting, b: Meeting): boolean {
  return (
    a.name === b.name &&
    a.date === b.date &&
    a.notes === b.notes &&
    a.participants.join("\n") === b.participants.join("\n") &&
    [...a.tagIds].sort().join() === [...b.tagIds].sort().join()
  );
}

/**
 * Writes the result of mergeBackup(current, imported) to Supabase, changing only what differs
 * from `current`: new or renamed tags, new or changed meetings and their tag links, and tags
 * that were merged into another tag. Throws if a request fails (earlier steps stay saved).
 */
export async function saveImport(current: BackupData, merged: MergeResult) {
  const supabase = getSupabase();
  try {
    const currentTags = new Map(current.tags.map((t) => [t.id, t]));
    const changedTags = merged.tags.filter((t) => currentTags.get(t.id)?.name !== t.name);
    if (changedTags.length > 0) {
      const { error } = await supabase
        .from("tags")
        .upsert(changedTags.map(({ id, name }) => ({ id, name })), { onConflict: "id" });
      if (error) throw error;
    }

    const currentMeetings = new Map(current.meetings.map((m) => [m.id, m]));
    const changedMeetings = merged.meetings.filter((m) => {
      const existing = currentMeetings.get(m.id);
      return !existing || !sameMeeting(existing, m);
    });
    if (changedMeetings.length > 0) {
      const { error } = await supabase.from("meetings").upsert(
        changedMeetings.map(({ id, name, date, participants, notes }) => ({
          id,
          name,
          date,
          participants,
          notes,
        })),
        { onConflict: "id" },
      );
      if (error) throw error;
    }

    const tagIds = new Set(merged.tags.map((t) => t.id));
    for (const meeting of changedMeetings) {
      const before = currentMeetings.get(meeting.id)?.tagIds ?? [];
      // Skip IDs of tags that don't exist (e.g. deleted before the backup was made).
      const after = meeting.tagIds.filter((id) => tagIds.has(id));
      const removed = before.filter((id) => !after.includes(id));
      const added = after.filter((id) => !before.includes(id));
      if (removed.length > 0) {
        const { error } = await supabase
          .from("meeting_tags")
          .delete()
          .eq("meeting_id", meeting.id)
          .in("tag_id", removed);
        if (error) throw error;
      }
      if (added.length > 0) {
        const { error } = await supabase
          .from("meeting_tags")
          .insert(added.map((tagId) => ({ meeting_id: meeting.id, tag_id: tagId })));
        if (error) throw error;
      }
    }

    // Existing tags that the backup merged into another tag (same name).
    const mergedAway = current.tags.filter((t) => !tagIds.has(t.id)).map((t) => t.id);
    if (mergedAway.length > 0) {
      const { error } = await supabase.from("tags").delete().in("id", mergedAway);
      if (error) throw error;
    }
  } finally {
    await Promise.all([refreshTags().catch(() => {}), refreshMeetings()]);
  }
}
