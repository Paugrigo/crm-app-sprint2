"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DATE_PRESETS,
  describeDate,
  hasFilters,
  type DateFilter,
  type MeetingFilters,
} from "@/lib/meeting-filters";
import { useMeetings } from "@/lib/meetings";
import { sortTags, useTags } from "@/lib/tags";
import { DatePicker } from "./date-picker";
import { buttonGhost, input, label } from "./ui";

/**
 * Tag, date, and participant filters for the meeting log, as one row of dropdowns under the
 * search box. `onChange` gets a patch to apply to the filters in the URL; `onClearAll` clears
 * the search text and every filter.
 */
export function MeetingFilterBar({
  filters,
  onChange,
  onClearAll,
}: {
  filters: MeetingFilters;
  onChange: (patch: Partial<MeetingFilters>) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <TagFilter filters={filters} onChange={onChange} />
      <DateFilterMenu date={filters.date} onChange={(date) => onChange({ date })} />
      <PeopleFilter filters={filters} onChange={onChange} />
      {hasFilters(filters) && (
        <button type="button" onClick={onClearAll} className={`${buttonGhost} text-xs`}>
          Clear all
        </button>
      )}
    </div>
  );
}

function TagFilter({
  filters,
  onChange,
}: {
  filters: MeetingFilters;
  onChange: (patch: Partial<MeetingFilters>) => void;
}) {
  const tags = sortTags(useTags());
  const selected = filters.tagIds.filter((id) => tags.some((t) => t.id === id));
  const first = tags.find((t) => t.id === selected[0]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id];
    onChange({ tagIds: next });
  }

  return (
    <FilterMenu
      label="Tags"
      value={
        selected.length === 0
          ? null
          : selected.length === 1
            ? first?.name
            : `${selected.length}, ${filters.tagsMatchAll ? "all" : "any"}`
      }
      onClear={() => onChange({ tagIds: [] })}
    >
      {tags.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">No tags yet. Create some on the Tags page.</p>
      ) : (
        <>
          <MatchToggle
            all={filters.tagsMatchAll}
            onChange={(all) => onChange({ tagsMatchAll: all })}
            anyLabel="Any tag"
            allLabel="All tags"
          />
          <CheckList
            items={tags.map((t) => ({ value: t.id, label: t.name }))}
            selected={selected}
            onToggle={toggle}
            mono
          />
        </>
      )}
    </FilterMenu>
  );
}

/** Everyone in the user's meetings, most met first; names that differ only in case count once. */
function useParticipants(): string[] {
  const meetings = useMeetings();
  const byKey = new Map<string, { name: string; count: number }>();
  for (const meeting of meetings) {
    for (const name of meeting.participants) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const entry = byKey.get(key);
      if (entry) entry.count++;
      else byKey.set(key, { name: name.trim(), count: 1 });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((p) => p.name);
}

function PeopleFilter({
  filters,
  onChange,
}: {
  filters: MeetingFilters;
  onChange: (patch: Partial<MeetingFilters>) => void;
}) {
  const participants = useParticipants();
  const [find, setFind] = useState("");
  const selected = filters.people;
  const isSelected = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());

  function toggle(name: string) {
    onChange({
      people: isSelected(name)
        ? selected.filter((s) => s.toLowerCase() !== name.toLowerCase())
        : [...selected, name],
    });
  }

  const needle = find.trim().toLowerCase();
  // Selected people first (also ones no longer in any meeting), then the rest.
  const options = [
    ...selected,
    ...participants.filter((name) => !isSelected(name)),
  ].filter((name) => !needle || name.toLowerCase().includes(needle));

  return (
    <FilterMenu
      label="People"
      value={
        selected.length === 0
          ? null
          : selected.length === 1
            ? selected[0]
            : `${selected.length}, ${filters.peopleMatchAll ? "all" : "any"}`
      }
      onClear={() => onChange({ people: [] })}
    >
      {participants.length === 0 && selected.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">No participants yet.</p>
      ) : (
        <>
          <MatchToggle
            all={filters.peopleMatchAll}
            onChange={(all) => onChange({ peopleMatchAll: all })}
            anyLabel="Any of them"
            allLabel="All together"
          />
          <div className="border-b border-line p-2">
            <input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find a person"
              aria-label="Find a person"
              autoComplete="off"
              className={`${input} py-1.5`}
            />
          </div>
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">Nobody matches &ldquo;{find.trim()}&rdquo;.</p>
          ) : (
            <CheckList
              items={options.map((name) => ({ value: name, label: name }))}
              selected={options.filter(isSelected)}
              onToggle={toggle}
            />
          )}
        </>
      )}
    </FilterMenu>
  );
}

function DateFilterMenu({
  date,
  onChange,
}: {
  date: DateFilter;
  onChange: (date: DateFilter) => void;
}) {
  const name = useId();
  const range = date.kind === "range" ? date : { from: "", to: "" };

  function setRange(from: string, to: string) {
    onChange(from || to ? { kind: "range", from, to } : { kind: "any" });
  }

  const options: { key: string; label: string; checked: boolean; select: () => void }[] = [
    { key: "any", label: "Any time", checked: date.kind === "any", select: () => onChange({ kind: "any" }) },
    ...DATE_PRESETS.map((p) => ({
      key: p.value,
      label: p.label,
      checked: date.kind === "preset" && date.preset === p.value,
      select: () => onChange({ kind: "preset", preset: p.value }),
    })),
  ];

  return (
    <FilterMenu
      label="Date"
      value={date.kind === "any" ? null : describeDate(date)}
      onClear={() => onChange({ kind: "any" })}
    >
      <fieldset className="py-1">
        <legend className="sr-only">Date</legend>
        {options.map((option) => (
          <label
            key={option.key}
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-fg hover:bg-surface-2"
          >
            <input
              type="radio"
              name={name}
              checked={option.checked}
              onChange={option.select}
              className="accent-accent"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="space-y-2 border-t border-line p-3">
        <p className={label}>Custom range</p>
        <div className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
          <label htmlFor={`${name}-from`} className="text-xs text-muted">
            From
          </label>
          <DatePicker
            id={`${name}-from`}
            value={range.from}
            onChange={(from) => setRange(from, range.to)}
            className={`${input} py-1.5 font-mono`}
          />
          <label htmlFor={`${name}-to`} className="text-xs text-muted">
            To
          </label>
          <DatePicker
            id={`${name}-to`}
            value={range.to}
            onChange={(to) => setRange(range.from, to)}
            className={`${input} py-1.5 font-mono`}
          />
        </div>
        {range.from && range.to && range.from > range.to && (
          <p role="alert" className="font-mono text-xs text-danger">
            &ldquo;From&rdquo; is after &ldquo;To&rdquo;, so nothing can match.
          </p>
        )}
      </div>
    </FilterMenu>
  );
}

/** Any/All switch at the top of a multi-select menu. */
function MatchToggle({
  all,
  onChange,
  anyLabel,
  allLabel,
}: {
  all: boolean;
  onChange: (all: boolean) => void;
  anyLabel: string;
  allLabel: string;
}) {
  const option = (value: boolean, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={all === value}
      onClick={() => onChange(value)}
      className={`flex-1 rounded-sm px-2 py-1 font-mono text-xs transition-colors ${
        all === value ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Match" className="flex gap-1 border-b border-line p-2">
      {option(false, anyLabel)}
      {option(true, allLabel)}
    </div>
  );
}

function CheckList({
  items,
  selected,
  onToggle,
  mono,
}: {
  items: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <ul className="max-h-64 overflow-y-auto py-1">
      {items.map((item) => (
        <li key={item.value}>
          <label
            className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-fg hover:bg-surface-2 ${mono ? "font-mono" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.includes(item.value)}
              onChange={() => onToggle(item.value)}
              className="accent-accent"
            />
            <span className="truncate">{item.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * A filter button with a dropdown panel. Shows "Label: value" while the filter is set, with a
 * small × to clear it. Closes on a click outside or Escape.
 */
function FilterMenu({
  label: name,
  value,
  onClear,
  children,
}: {
  label: string;
  value: ReactNode;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = value !== null && value !== undefined;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center rounded-sm border text-sm transition-colors ${
          active ? "border-accent bg-accent-soft text-fg" : "border-line-strong bg-surface text-muted hover:text-fg"
        }`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex max-w-56 items-center gap-1.5 px-2.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span className="font-mono text-xs uppercase tracking-wider">{name}</span>
          {active && <span className="truncate">{value}</span>}
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0 opacity-70">
            <path d="M5.5 7.5 10 12l4.5-4.5h-9Z" />
          </svg>
        </button>
        {active && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${name.toLowerCase()} filter`}
            title={`Clear ${name.toLowerCase()} filter`}
            className="border-l border-accent/40 px-1.5 py-1.5 text-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div
          id={panelId}
          // No overflow-hidden: the date picker's calendar pops out of this panel.
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-line-strong bg-surface shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
