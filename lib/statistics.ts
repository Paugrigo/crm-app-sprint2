// Meeting statistics for the /statistics page. Pure functions; reading storage is up to the caller.
// Only meetings dated up to today count, so planned meetings don't skew the numbers.

import type { StatisticsMeeting } from "./meetings";
import { sortTags, type Tag } from "./tags";

export type MonthCount = { month: string /* YYYY-MM */; count: number };
export type PersonStats = { name: string; meetings: number; lastMet: string /* YYYY-MM-DD */ };
export type TagCount = { tag: Tag | null /* null: untagged */; count: number };
export type WeekdayCount = { weekday: number /* 0 = Monday */; count: number };

export type Statistics = {
  /** Meetings dated up to today; everything below is computed from these. */
  total: number;
  /** Meetings dated after today, which are left out. */
  upcoming: number;
  thisMonth: number;
  lastMonth: number;
  people: number;
  averageParticipants: number;
  /** The last 12 months, oldest first, including months with no meetings. */
  months: MonthCount[];
  /** Everyone met, most meetings first. */
  topPeople: PersonStats[];
  /** Everyone met, longest since the last meeting first. */
  longestSinceMet: PersonStats[];
  /** Every tag, most used first, then meetings without tags (if any). */
  tags: TagCount[];
  /** Monday to Sunday. */
  weekdays: WeekdayCount[];
};

const MONTHS_SHOWN = 12;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's local date as YYYY-MM-DD, the same format as Meeting.date. */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The YYYY-MM month `offset` months from the given one (negative goes back). */
function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + offset, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function parseDate(date: string): Date {
  // Build the date from its parts so it isn't shifted by the UTC parsing of "YYYY-MM-DD".
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  // Round, since a daylight saving change makes some days 23 or 25 hours long.
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Participant names are free text; treat "Anna", "anna " and "ANNA" as the same person. */
function personKey(name: string): string {
  return tidyName(name).toLowerCase();
}

/** The spelling used most often; ties go to the one used most recently. */
function preferredSpelling(spellings: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  // Maps iterate in insertion order; delete-and-reinsert below keeps recent spellings last.
  for (const [spelling, count] of spellings) {
    if (count >= bestCount) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

export function computeStatistics(
  meetings: StatisticsMeeting[],
  tags: Tag[],
  today: string,
): Statistics {
  const past = meetings.filter((m) => m.date <= today);
  // Oldest first, so later meetings overwrite each person's last-met date.
  const chronological = [...past].sort((a, b) => a.date.localeCompare(b.date));

  const currentMonth = today.slice(0, 7);
  const previousMonth = shiftMonth(currentMonth, -1);

  const monthCounts = new Map<string, number>();
  const weekdayCounts = Array<number>(7).fill(0);
  const people = new Map<
    string,
    { spellings: Map<string, number>; meetings: number; lastMet: string }
  >();
  const tagCounts = new Map<string, number>();
  const tagIds = new Set(tags.map((t) => t.id));
  let untagged = 0;
  let participantTotal = 0;

  for (const meeting of chronological) {
    const month = meeting.date.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    // getDay() is 0 for Sunday; shift so the week starts on Monday.
    weekdayCounts[(parseDate(meeting.date).getDay() + 6) % 7]++;

    // Count each person once per meeting, even if listed twice.
    const keys = new Set<string>();
    for (const name of meeting.participants) {
      const key = personKey(name);
      if (!key || keys.has(key)) continue;
      keys.add(key);
      const person = people.get(key) ?? { spellings: new Map(), meetings: 0, lastMet: "" };
      const spelling = tidyName(name);
      const uses = (person.spellings.get(spelling) ?? 0) + 1;
      person.spellings.delete(spelling);
      person.spellings.set(spelling, uses);
      person.meetings++;
      person.lastMet = meeting.date;
      people.set(key, person);
    }
    participantTotal += keys.size;

    // Meetings may still list IDs of deleted tags; ignore those.
    const meetingTags = new Set(meeting.tagIds.filter((id) => tagIds.has(id)));
    if (meetingTags.size === 0) untagged++;
    for (const id of meetingTags) tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1);
  }

  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const month = shiftMonth(currentMonth, i - (MONTHS_SHOWN - 1));
    return { month, count: monthCounts.get(month) ?? 0 };
  });

  const everyone: PersonStats[] = [...people.values()].map((p) => ({
    name: preferredSpelling(p.spellings),
    meetings: p.meetings,
    lastMet: p.lastMet,
  }));
  const topPeople = [...everyone].sort(
    (a, b) =>
      b.meetings - a.meetings ||
      b.lastMet.localeCompare(a.lastMet) ||
      a.name.localeCompare(b.name),
  );
  const longestSinceMet = [...everyone].sort(
    (a, b) => a.lastMet.localeCompare(b.lastMet) || a.name.localeCompare(b.name),
  );

  // sortTags orders by name; the stable sort keeps that order between equal counts.
  const tagStats: TagCount[] = sortTags(tags)
    .map((tag) => ({ tag, count: tagCounts.get(tag.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  if (untagged > 0) tagStats.push({ tag: null, count: untagged });

  return {
    total: past.length,
    upcoming: meetings.length - past.length,
    thisMonth: monthCounts.get(currentMonth) ?? 0,
    lastMonth: monthCounts.get(previousMonth) ?? 0,
    people: people.size,
    averageParticipants: past.length === 0 ? 0 : participantTotal / past.length,
    months,
    topPeople,
    longestSinceMet,
    tags: tagStats,
    weekdays: weekdayCounts.map((count, weekday) => ({ weekday, count })),
  };
}
