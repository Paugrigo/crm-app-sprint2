"use client";

import Link from "next/link";
import { use, type ReactNode } from "react";
import { browser } from "react-dom";
import { formatMeetingDate } from "@/lib/format-date";
import { computeStatistics, daysBetween, localToday, type PersonStats } from "@/lib/statistics";
import { useMeetings } from "@/lib/meetings";
import { useTags } from "@/lib/tags";
import { buttonPrimary, emptyState, label, panel, panelHeader } from "./ui";

const PEOPLE_SHOWN = 5;

const muted = "text-sm text-muted";
const bar = "rounded-[1px] bg-accent";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Browser-only: meetings and tags are loaded from Supabase with the signed-in user's session.
// Render inside a <Suspense> boundary.
export function Statistics() {
  use(browser("Meetings are loaded from Supabase in the browser."));

  const meetings = useMeetings();
  const tags = useTags();
  const today = localToday();
  const stats = computeStatistics(meetings, tags, today);

  const upcomingNote =
    stats.upcoming > 0 ? (
      <p className="font-mono text-xs text-faint">
        {plural(stats.upcoming, "meeting")} dated after today{" "}
        {stats.upcoming === 1 ? "isn't" : "aren't"} counted.
      </p>
    ) : null;

  if (stats.total === 0) {
    return (
      <div className="space-y-4">
        <div className={emptyState}>
          <p className={label}>No data</p>
          <p className="mt-2 font-medium text-fg">No statistics yet</p>
          <p className="mt-1 text-sm text-muted">
            Statistics appear once you&apos;ve logged a meeting dated today or earlier.
          </p>
          <Link href="/meetings/new" className={`${buttonPrimary} mt-4`}>
            Log a meeting
          </Link>
        </div>
        {upcomingNote}
      </div>
    );
  }

  const monthChange = stats.thisMonth - stats.lastMonth;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4">
        <StatCard label="Meetings" value={stats.total} />
        <StatCard
          label="This month"
          value={stats.thisMonth}
          detail={
            monthChange === 0 ? (
              "= Same as last month"
            ) : (
              <>
                <span className={monthChange > 0 ? "text-up" : "text-down"}>
                  {monthChange > 0 ? "▲ +" : "▼ −"}
                  {Math.abs(monthChange)}
                </span>{" "}
                vs last month
              </>
            )
          }
        />
        <StatCard label="People met" value={stats.people} />
        <StatCard
          label="Avg. participants"
          value={stats.averageParticipants.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          detail="per meeting"
        />
      </dl>
      {upcomingNote}

      <Panel title="Meetings per month" meta="Last 12 months">
        <MonthChart months={stats.months} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Who you meet most" meta={`Top ${PEOPLE_SHOWN}`}>
          <PeopleList
            people={stats.topPeople.slice(0, PEOPLE_SHOWN)}
            describe={(p) => plural(p.meetings, "meeting")}
            detail={(p) => `Last met ${formatMeetingDate(p.lastMet)}`}
          />
        </Panel>
        <Panel title="Not met in a while" meta={`Top ${PEOPLE_SHOWN}`}>
          <PeopleList
            people={stats.longestSinceMet.slice(0, PEOPLE_SHOWN)}
            describe={(p) => timeSince(p.lastMet, today)}
            detail={(p) => `Last met ${formatMeetingDate(p.lastMet)}`}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Meetings by tag">
          {stats.tags.length === 0 ? (
            <p className={muted}>No tags yet.</p>
          ) : (
            <BarList
              items={stats.tags.map(({ tag, count }) => ({
                key: tag?.id ?? "untagged",
                label: tag ? (
                  <>
                    <span aria-hidden="true" className="text-accent-fg">
                      #
                    </span>
                    {tag.name}
                  </>
                ) : (
                  <span className="text-faint">(untagged)</span>
                ),
                count,
              }))}
            />
          )}
          {stats.tags.some((t) => t.tag) && (
            <p className="mt-4 font-mono text-[11px] text-faint">
              A meeting with several tags counts once for each.
            </p>
          )}
        </Panel>
        <Panel title="Day of the week">
          <BarList
            items={stats.weekdays.map(({ weekday, count }) => ({
              key: String(weekday),
              label: weekdayName(weekday),
              count,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className={panel}>
      <div className={panelHeader}>
        <h2 className={label}>{title}</h2>
        {meta && <span className="font-mono text-[11px] text-faint">{meta}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatCard({
  label: title,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="bg-surface p-4">
      <dt className={label}>{title}</dt>
      <dd className="mt-2 font-mono text-3xl font-semibold tracking-tight text-fg">{value}</dd>
      {detail && <dd className="mt-1 font-mono text-[11px] text-muted">{detail}</dd>}
    </div>
  );
}

function MonthChart({ months }: { months: { month: string; count: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <ol className="flex h-48 items-end gap-1 sm:gap-2">
      {months.map(({ month, count }, i) => {
        const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1);
        const short = date.toLocaleDateString(undefined, { month: "short" });
        // Show the year under the first bar and under each January.
        const showYear = i === 0 || date.getMonth() === 0;
        return (
          <li key={month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="sr-only">
              {date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}:{" "}
              {plural(count, "meeting")}
            </span>
            {/* The top padding leaves room for the count above the tallest bar. */}
            <div aria-hidden="true" className="flex min-h-0 w-full flex-1 items-end justify-center pt-5">
              <div
                className={`relative w-full max-w-10 ${count > 0 ? bar : "bg-line"}`}
                style={{ height: count > 0 ? `${(count / max) * 100}%` : "2px" }}
              >
                {count > 0 && (
                  <span className="absolute inset-x-0 -top-5 text-center font-mono text-[11px] text-muted">
                    {count}
                  </span>
                )}
              </div>
            </div>
            <span aria-hidden="true" className="mt-2 h-8 border-t border-line pt-1 text-center font-mono text-[10px] uppercase leading-4 text-faint">
              {short}
              {showYear && <span className="block">{date.getFullYear()}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BarList({ items }: { items: { key: string; label: ReactNode; count: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="space-y-2.5">
      {items.map(({ key, label, count }) => (
        <li key={key}>
          <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 truncate font-mono text-xs text-fg">
              {label}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted">{count}</span>
          </div>
          <div aria-hidden="true" className="h-1.5 rounded-[1px] bg-surface-2">
            <div className={`h-full ${bar}`} style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PeopleList({
  people,
  describe,
  detail,
}: {
  people: PersonStats[];
  describe: (person: PersonStats) => string;
  detail: (person: PersonStats) => string;
}) {
  if (people.length === 0) {
    return <p className={muted}>No participants recorded yet.</p>;
  }
  return (
    <ol className="-my-1 divide-y divide-line">
      {people.map((person) => (
        <li
          key={person.name.toLowerCase()}
          className="flex items-baseline justify-between gap-4 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">
              {person.name}
            </p>
            <p className="font-mono text-[11px] text-faint">{detail(person)}</p>
          </div>
          <span className="shrink-0 font-mono text-xs text-accent-fg">
            {describe(person)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** E.g. "today", "3 days ago", "5 weeks ago", "4 months ago", "2 years ago". */
function timeSince(date: string, today: string): string {
  const days = daysBetween(date, today);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30.44)} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

/** Weekday name for 0 = Monday … 6 = Sunday. */
function weekdayName(weekday: number): string {
  // Jan 1, 2024 was a Monday.
  return new Date(2024, 0, 1 + weekday).toLocaleDateString(undefined, { weekday: "long" });
}
