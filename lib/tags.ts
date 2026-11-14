// Tags, stored in Supabase (table `tags`). Meetings refer to tags by ID through `meeting_tags`.
// Row Level Security limits every query to the signed-in user's rows. Browser-only: see
// lib/remote-store.ts.

import { createRemoteStore, invalidate } from "./remote-store";
import { getSupabase } from "./supabase/client";

export type Tag = {
  id: string;
  name: string;
};

/**
 * Longest tag name, counted after trimming. Same limit as the check constraint on `tags.name` in
 * supabase/migrations/20261108120000_initial_schema.sql; change both together.
 */
export const TAG_NAME_MAX_LENGTH = 40;

/** Postgres error code for a unique constraint violation (here: a duplicate tag name). */
const UNIQUE_VIOLATION = "23505";

/**
 * Returns the value as a Tag with a trimmed name, or null if it isn't one or the database would
 * reject the name (blank or longer than TAG_NAME_MAX_LENGTH). Used for backup files.
 */
export function toTag(value: unknown): Tag | null {
  if (typeof value !== "object" || value === null) return null;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.name !== "string") return null;
  const name = t.name.trim();
  if (!name || name.length > TAG_NAME_MAX_LENGTH) return null;
  return { id: t.id, name };
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

const store = createRemoteStore(fetchTags, { tables: ["tags"] });

/** The signed-in user's tags (unsorted). Suspends until loaded. */
export const useTags = store.useValue;

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
    await invalidate("tags");
  }
}

/** Meetings refer to tags by ID, so they show the new name automatically. */
export async function renameTag(id: string, name: string) {
  try {
    const { error } = await getSupabase().from("tags").update({ name }).eq("id", id);
    if (error) rethrow(error);
  } finally {
    // Also reloads meeting search results, which match on tag names.
    await invalidate("tags");
  }
}

/** Deletes a tag. The database removes it from every meeting; the meetings are kept. */
export async function deleteTag(id: string) {
  try {
    const { error } = await getSupabase().from("tags").delete().eq("id", id);
    if (error) throw error;
  } finally {
    // Deleting a tag also deletes its meeting_tags rows (on delete cascade).
    await invalidate("tags", "meeting_tags");
  }
}
