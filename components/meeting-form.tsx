"use client";

import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { MeetingDraft } from "@/lib/meetings";
import { sortTags, useTags } from "@/lib/tags";
import { DatePicker } from "./date-picker";
import { buttonPrimary, buttonSecondary, input, label, textLink } from "./ui";

function todayAsDateInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const labelClass = `mb-1.5 block ${label}`;

/**
 * Form for logging a meeting. Pass `initial` to edit an existing meeting instead: the
 * fields start with its values and aren't cleared after saving. `onSubmit` saves the draft and
 * resolves to whether it worked; the submit button is disabled meanwhile, and the form keeps
 * its values if saving fails.
 */
export function MeetingForm({
  onSubmit,
  initial,
  submitLabel = "Log meeting",
  onCancel,
}: {
  onSubmit: (draft: MeetingDraft) => Promise<boolean>;
  initial?: MeetingDraft;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? todayAsDateInputValue);
  const [participants, setParticipants] = useState<string[]>(initial?.participants ?? []);
  const [participantInput, setParticipantInput] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [saving, setSaving] = useState(false);
  const tags = sortTags(useTags());

  function toggleTag(tagId: string) {
    setTagIds(tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId]);
  }

  function addParticipant() {
    const participant = participantInput.trim();
    if (!participant) return;
    const alreadyAdded = participants.some(
      (p) => p.toLowerCase() === participant.toLowerCase(),
    );
    if (!alreadyAdded) setParticipants([...participants, participant]);
    setParticipantInput("");
  }

  function removeParticipant(participant: string) {
    setParticipants(participants.filter((p) => p !== participant));
  }

  function handleParticipantKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the participant instead of submitting the whole form.
    if (event.key === "Enter") {
      event.preventDefault();
      addParticipant();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    // Include a participant that was typed but not yet added.
    const pending = participantInput.trim();
    const allParticipants =
      pending && !participants.some((p) => p.toLowerCase() === pending.toLowerCase())
        ? [...participants, pending]
        : participants;

    // Drop IDs of tags that no longer exist.
    const existingTagIds = tagIds.filter((id) => tags.some((tag) => tag.id === id));

    setSaving(true);
    const saved = await onSubmit({
      name: name.trim(),
      date,
      participants: allParticipants,
      notes: notes.trim(),
      tagIds: existingTagIds,
    });
    setSaving(false);
    if (!saved || initial) return;

    setName("");
    setDate(todayAsDateInputValue());
    setParticipants([]);
    setParticipantInput("");
    setNotes("");
    setTagIds([]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="meeting-name" className={labelClass}>
            Meeting name
          </label>
          <input
            id="meeting-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quarterly review with Acme"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="meeting-date" className={labelClass}>
            Date
          </label>
          <DatePicker
            id="meeting-date"
            required
            value={date}
            onChange={setDate}
            className={`${input} font-mono`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="meeting-participant" className={labelClass}>
          Participants
        </label>
        <div className="flex gap-2">
          <input
            id="meeting-participant"
            type="text"
            value={participantInput}
            onChange={(e) => setParticipantInput(e.target.value)}
            onKeyDown={handleParticipantKeyDown}
            placeholder="Type a name and press Enter"
            className={input}
          />
          <button
            type="button"
            onClick={addParticipant}
            className={`${buttonSecondary} shrink-0`}
          >
            Add
          </button>
        </div>
        {participants.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {participants.map((participant) => (
              <li
                key={participant}
                className="flex items-center gap-1 rounded-sm border border-line bg-surface-2 py-0.5 pl-2 pr-0.5 text-sm text-fg"
              >
                {participant}
                <button
                  type="button"
                  onClick={() => removeParticipant(participant)}
                  aria-label={`Remove ${participant}`}
                  className="rounded-sm px-1.5 text-faint hover:bg-danger-soft hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset>
        <legend className={labelClass}>Tags</legend>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const selected = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={selected}
                  className={`rounded-sm border px-2 py-1 font-mono text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    selected
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line-strong text-muted hover:border-muted hover:text-fg"
                  }`}
                >
                  {selected && <span aria-hidden="true" className="text-accent-fg">✓ </span>}
                  <span aria-hidden="true" className={selected ? "text-accent-fg" : "text-faint"}>
                    #
                  </span>
                  {tag.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No tags yet.{" "}
            <Link href="/tags" className={textLink}>
              Create tags
            </Link>{" "}
            to group your meetings.
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="meeting-notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="meeting-notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was discussed, decisions, next steps…"
          className={input}
        />
      </div>

      <div className="flex gap-2 border-t border-line pt-4">
        <button type="submit" disabled={saving} className={`${buttonPrimary} px-4`}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={`${buttonSecondary} px-4`}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
