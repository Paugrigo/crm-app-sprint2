"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useState } from "react";
import { browser } from "react-dom";
import { signOut } from "@/lib/auth-actions";
import { formatMeetingDate } from "@/lib/format-date";
import { useMeetings } from "@/lib/meetings";
import { buttonPrimary, buttonSecondary, label } from "./ui";

const RECENT_LIMIT = 8;

// The active item gets a soft amber background and a 2px amber bar on its left edge.
const linkBase =
  "relative flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const linkIdle = "text-muted hover:bg-surface-2 hover:text-fg";
const linkActive =
  "bg-accent-soft font-medium text-fg before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent";

/**
 * App menu: a left sidebar on wider screens, a top bar with a Menu toggle on phones.
 * Rendered by the private layout (app/(private)/layout.tsx), so it stays mounted across
 * navigations. `email` is the signed-in user's, read on the server.
 */
export function Sidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <aside className="border-b border-line bg-surface md:sticky md:flex md:flex-col md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-line px-4 py-3 md:border-b md:py-4">
        <Link
          href="/"
          onClick={close}
          className="flex items-center gap-2 rounded-sm font-mono text-sm font-semibold uppercase tracking-widest text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-accent" />
          Meeting log
        </Link>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="app-menu"
          className={`${buttonSecondary} md:hidden`}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <nav
        id="app-menu"
        aria-label="Main"
        className={`${open ? "flex" : "hidden"} flex-col px-3 pb-4 md:flex md:flex-1 md:pt-4 md:pb-4`}
      >
        {/* The active link depends on the URL, and recent meetings are loaded from Supabase in
            the browser; show plain links until both are known. */}
        <Suspense
          fallback={
            <>
              <MainLinks pathname={null} onNavigate={close} />
              <SettingsLink pathname={null} onNavigate={close} />
            </>
          }
        >
          <SidebarContent onNavigate={close} />
        </Suspense>
        <Account email={email} />
      </nav>
    </aside>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <MainLinks pathname={pathname} onNavigate={onNavigate} />
      <RecentMeetings pathname={pathname} onNavigate={onNavigate} />
      <SettingsLink pathname={pathname} onNavigate={onNavigate} />
    </>
  );
}

/** The signed-in user's email and a Sign out button, at the very bottom of the menu. */
function Account({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setFailed(false);
    try {
      const { ok } = await signOut();
      if (!ok) throw new Error("Sign-out failed");
      // A full page load (not router.push) on purpose: it clears all in-memory data, including
      // pages Next.js keeps alive in the background, so the next user can't see this user's.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line px-3 pt-3">
      <p className={label}>Signed in as</p>
      <p className="mt-1 truncate text-sm text-fg" title={email}>
        {email}
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className={`${buttonSecondary} mt-2 w-full`}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {failed && (
        <p role="alert" className="mt-2 font-mono text-xs text-danger">
          Couldn&apos;t sign out. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

/** Pinned to the bottom of the sidebar on wider screens (above the account); in the phone menu too. */
function SettingsLink({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate: () => void;
}) {
  const active = pathname === "/settings";
  return (
    <div className="mt-6 border-t border-line pt-3 md:mt-auto">
      <Link
        href="/settings"
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`${linkBase} ${active ? linkActive : linkIdle}`}
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
          <path d="M3.5 6h13M3.5 14h13" />
          <circle cx="7.5" cy="6" r="1.75" fill="currentColor" />
          <circle cx="12.5" cy="14" r="1.75" fill="currentColor" />
        </svg>
        Settings
      </Link>
    </div>
  );
}

function MainLinks({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate: () => void;
}) {
  return (
    <>
      {/* The main action, styled as a primary button so it stands out from the links. */}
      <Link
        href="/meetings/new"
        onClick={onNavigate}
        aria-current={pathname === "/meetings/new" ? "page" : undefined}
        className={`${buttonPrimary} mb-5 w-full py-2 font-semibold aria-[current=page]:ring-2 aria-[current=page]:ring-accent/50 aria-[current=page]:ring-offset-2 aria-[current=page]:ring-offset-surface`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="size-4"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
        Log a meeting
      </Link>
      <h2 className={`mb-1.5 px-3 ${label}`}>Navigate</h2>
      <ul className="space-y-0.5">
        <li>
          <Link
            href="/"
            onClick={onNavigate}
            aria-current={pathname === "/" ? "page" : undefined}
            className={`${linkBase} ${pathname === "/" ? linkActive : linkIdle}`}
          >
            All meetings
          </Link>
        </li>
        <li>
          <Link
            href="/tags"
            onClick={onNavigate}
            aria-current={pathname === "/tags" ? "page" : undefined}
            className={`${linkBase} ${pathname === "/tags" ? linkActive : linkIdle}`}
          >
            Tags
          </Link>
        </li>
        <li>
          <Link
            href="/statistics"
            onClick={onNavigate}
            aria-current={pathname === "/statistics" ? "page" : undefined}
            className={`${linkBase} ${pathname === "/statistics" ? linkActive : linkIdle}`}
          >
            Statistics
          </Link>
        </li>
      </ul>
    </>
  );
}

function RecentMeetings({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  use(browser("Meetings are loaded from Supabase in the browser."));
  const meetings = useMeetings();

  // Newest first, like the meeting list; ISO dates sort correctly as strings.
  const recent = [...meetings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_LIMIT);

  return (
    <div className="mt-6">
      <h2 className={`px-3 ${label}`}>Recent</h2>
      {recent.length === 0 ? (
        <p className="mt-1.5 px-3 text-sm text-faint">None yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {recent.map((meeting) => {
            const href = `/meetings/${meeting.id}`;
            const active = pathname === href;
            return (
              <li key={meeting.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`${linkBase} ${active ? linkActive : linkIdle}`}
                >
                  <span className="min-w-0 flex-1 truncate">{meeting.name}</span>
                  <time
                    dateTime={meeting.date}
                    title={formatMeetingDate(meeting.date)}
                    className="shrink-0 font-mono text-[11px] font-normal text-faint"
                  >
                    {meeting.date.slice(5)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {meetings.length > RECENT_LIMIT && (
        <Link
          href="/"
          onClick={onNavigate}
          className="mt-2 block px-3 font-mono text-xs text-muted hover:text-accent-fg"
        >
          View all {meetings.length} →
        </Link>
      )}
    </div>
  );
}
