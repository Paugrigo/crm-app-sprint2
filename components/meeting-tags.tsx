"use client";

import { sortTags, useTags } from "@/lib/tags";

/**
 * A meeting's tags as small labels, sorted by name. Skips IDs of tags that no longer exist,
 * and renders nothing if there are none, unless `emptyMessage` is given.
 */
export function MeetingTags({
  tagIds,
  className = "",
  emptyMessage,
}: {
  tagIds: string[];
  className?: string;
  emptyMessage?: string;
}) {
  const tags = sortTags(useTags().filter((tag) => tagIds.includes(tag.id)));

  if (tags.length === 0) {
    return emptyMessage ? (
      <p className={`text-sm text-faint ${className}`}>{emptyMessage}</p>
    ) : null;
  }

  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="Tags">
      {tags.map((tag) => (
        <li
          key={tag.id}
          className="rounded-sm border border-line bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted"
        >
          <span aria-hidden="true" className="text-accent-fg">
            #
          </span>
          {tag.name}
        </li>
      ))}
    </ul>
  );
}
