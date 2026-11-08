"use client";

import { use, useLayoutEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { browser } from "react-dom";
import { useMeetings } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import {
  createTag,
  deleteTag,
  DuplicateTagNameError,
  renameTag,
  sameTagName,
  sortTags,
  TAG_NAME_MAX_LENGTH,
  useTags,
  type Tag,
} from "@/lib/tags";
import { DeleteButton } from "./delete-button";
import {
  buttonPrimary,
  buttonSecondary,
  emptyState,
  iconButton,
  input,
  label,
  panel,
  panelHeader,
} from "./ui";

type Status = { kind: "success" | "error"; text: string };

// Browser-only: tags and meetings are loaded from Supabase with the signed-in user's session.
// Render inside a <Suspense> boundary.
export function TagsManager() {
  use(browser("Tags are loaded from Supabase in the browser."));

  const tags = useTags();
  const meetings = useMeetings();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Next.js keeps this page alive (hidden) after navigating away; don't show an old
  // result message or a half-finished rename when coming back.
  useLayoutEffect(
    () => () => {
      setStatus(null);
      setEditingId(null);
    },
    [],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    const existing = tags.find((tag) => sameTagName(tag.name, trimmed));
    if (existing) {
      setStatus({ kind: "error", text: `A tag named "${existing.name}" already exists.` });
      return;
    }

    setCreating(true);
    try {
      await createTag(trimmed);
      setName("");
      setStatus({ kind: "success", text: `Created tag "${trimmed}".` });
    } catch (e) {
      setStatus({
        kind: "error",
        text:
          e instanceof DuplicateTagNameError
            ? `A tag named "${trimmed}" already exists.`
            : `Couldn't create the tag. ${describeError(e)}`,
      });
    }
    setCreating(false);
  }

  /** Renames the tag; resolves to an error message, or null on success. */
  async function handleRename(tag: Tag, newName: string): Promise<string | null> {
    const trimmed = newName.trim();
    if (!trimmed) return "Tag name can't be empty.";
    const existing = tags.find((t) => t.id !== tag.id && sameTagName(t.name, trimmed));
    if (existing) return `A tag named "${existing.name}" already exists.`;

    // Meetings refer to tags by ID, so they pick up the new name automatically.
    if (trimmed !== tag.name) {
      try {
        await renameTag(tag.id, trimmed);
      } catch (e) {
        return e instanceof DuplicateTagNameError
          ? `A tag named "${trimmed}" already exists.`
          : `Couldn't rename the tag. ${describeError(e)}`;
      }
      setStatus({ kind: "success", text: `Renamed "${tag.name}" to "${trimmed}".` });
    }
    setEditingId(null);
    return null;
  }

  async function handleDelete(tag: Tag) {
    // The database removes the tag from every meeting that uses it; the meetings are kept.
    try {
      await deleteTag(tag.id);
      setStatus({ kind: "success", text: `Deleted tag "${tag.name}".` });
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't delete the tag. ${describeError(e)}` });
    }
  }

  function meetingCount(tagId: string): number {
    return meetings.filter((meeting) => meeting.tagIds.includes(tagId)).length;
  }

  return (
    <div className="space-y-6">
      <section className={panel}>
        <div className={panelHeader}>
          <h2 className={label}>Create a tag</h2>
        </div>
        <form onSubmit={handleCreate} className="p-4">
          <label htmlFor="tag-name" className={`mb-1.5 block ${label}`}>
            Tag name
          </label>
          <div className="flex gap-2">
            <input
              id="tag-name"
              type="text"
              required
              maxLength={TAG_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setStatus(null);
              }}
              placeholder="e.g. Sales, Follow-up, Acme"
              className={input}
            />
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className={`${buttonPrimary} shrink-0 px-4`}
            >
              {creating ? "Creating…" : "Create tag"}
            </button>
          </div>
          {status && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={`mt-3 font-mono text-xs ${
                status.kind === "error" ? "text-danger" : "text-up"
              }`}
            >
              {status.kind === "error" ? "✕ " : "✓ "}
              {status.text}
            </p>
          )}
        </form>
      </section>

      <section className={`${panel} overflow-hidden`}>
        <div className={panelHeader}>
          <h2 className={label}>All tags</h2>
          <span className="font-mono text-xs text-muted">{tags.length} total</span>
        </div>
        {tags.length === 0 ? (
          <div className={`${emptyState} m-4`}>
            <p className={label}>No data</p>
            <p className="mt-2 font-medium text-fg">No tags yet</p>
            <p className="mt-1 text-sm text-muted">
              Create your first tag above, then add it to meetings when you log or edit them.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {sortTags(tags).map((tag) => {
              const count = meetingCount(tag.id);
              if (tag.id === editingId) {
                return (
                  <li key={tag.id} className="bg-surface-2 px-4 py-2.5">
                    <RenameTagForm
                      tag={tag}
                      onRename={(newName) => handleRename(tag, newName)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={tag.id}
                  className="flex items-center justify-between gap-4 px-4 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 break-words font-mono text-sm text-fg">
                    <span aria-hidden="true" className="text-accent-fg">
                      #
                    </span>
                    {tag.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-2 font-mono text-xs text-muted">
                      {count === 0
                        ? "Not used yet"
                        : `${count} ${count === 1 ? "meeting" : "meetings"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(tag.id);
                        setStatus(null);
                      }}
                      aria-label={`Rename tag ${tag.name}`}
                      title="Rename tag"
                      className={iconButton}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-4"
                      >
                        <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5ZM11.5 5.5l3 3" />
                      </svg>
                    </button>
                    <DeleteButton
                      label={`Delete tag ${tag.name}`}
                      title="Delete tag"
                      confirmMessage={
                        count === 0
                          ? `Delete the tag "${tag.name}"?`
                          : `Delete the tag "${tag.name}"? It will be removed from ${count} ${count === 1 ? "meeting" : "meetings"}. The meetings themselves are kept.`
                      }
                      onConfirm={() => handleDelete(tag)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Inline form that replaces a tag's row while renaming it. Enter saves, Escape cancels. */
function RenameTagForm({
  tag,
  onRename,
  onCancel,
}: {
  tag: Tag;
  onRename: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = `rename-tag-${tag.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const message = await onRename(name);
    // On success the row switches back to display mode and this form unmounts.
    if (message !== null) {
      setError(message);
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={inputId} className="sr-only">
        New name for {tag.name}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          type="text"
          required
          autoFocus
          maxLength={TAG_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={error !== null}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`${input} min-w-0 flex-1 py-1.5 font-mono`}
        />
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={buttonSecondary}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
