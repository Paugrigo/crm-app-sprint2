// Tags, stored in Supabase (table `tags`). Meetings refer to tags by ID through `meeting_tags`.
// Row Level Security limits every query to the signed-in user's rows. Browser-only: see
// lib/remote-store.ts.

import { refreshMeetings } from "./meetings";
import { createRemoteStore } from "./remote-store";
import { getSupabase } from "./supabase/client";

export type Tag = {
  id: string;
  name: string;
};

export const TAG_NAME_MAX_LENGTH = 40;

/** Postgres error code for a unique constraint violation (here: a duplicate tag name). */
const UNIQUE_VIOLATION = "23505";

export function isTag(value: unknown): value is Tag {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.name === "string";
}

/** Tag names are unique per user regardless of case and surrounding spaces. */
export function sameTagName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Tags sorted by name, for display. */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await getSupabase().from("tags").select("id, name").returns<Tag[]>();
  if (error) throw error;
  return data;
}

const store = createRemoteStore(fetchTags);

/** The signed-in user's tags (unsorted). Suspends until loaded. */
export const useTags = store.useValue;

export const refreshTags = store.refresh;

/** Thrown when a tag name is already taken (the database enforces this too). */
export class DuplicateTagNameError extends Error {}

function rethrow(error: { code?: string; message: string }): never {
  if (error.code === UNIQUE_VIOLATION) throw new DuplicateTagNameError(error.message);
  throw error;
}

export async function createTag(name: string) {
  try {
    const { error } = await getSupabase().from("tags").insert({ name });
    if (error) rethrow(error);
  } finally {
    await store.refresh().catch(() => {});
  }
}

/** Meetings refer to tags by ID, so they show the new name automatically. */
export async function renameTag(id: string, name: string) {
  try {
    const { error } = await getSupabase().from("tags").update({ name }).eq("id", id);
    if (error) rethrow(error);
  } finally {
    // Search results can match on tag names.
    await Promise.all([store.refresh().catch(() => {}), refreshMeetings()]);
  }
}

/** Deletes a tag. The database removes it from every meeting; the meetings are kept. */
export async function deleteTag(id: string) {
  try {
    const { error } = await getSupabase().from("tags").delete().eq("id", id);
    if (error) throw error;
  } finally {
    await Promise.all([store.refresh().catch(() => {}), refreshMeetings()]);
  }
}
