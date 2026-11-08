<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CRM App

A simple CRM for logging meetings. Each meeting has a **name**, a **date**, one or more **participants**, free-form **notes**, and zero or more **tags** (picked from the user's own tags).

The app already exists as a browser-only app (all data in `localStorage`). **This sprint moves it to Supabase:** email/password accounts, a protected private area, and all user data stored in Supabase with Row Level Security.

## Sprint goal and acceptance criteria

The sprint is done when all of these hold, verified locally with `npm run dev` at http://localhost:3000. Deployment is not required.

1. **Email/password auth.**
   - A sign-in page (`/sign-in`) with email and password.
   - A sign-up page (`/sign-up`) so test accounts can be created from the app (accounts made in the Supabase dashboard's Authentication tab must also work).
   - A sign-out button visible on every page of the private area (in the sidebar).
2. **The private area is protected on the server.**
   - Every page except `/sign-in` and `/sign-up` is private. A signed-out visitor who opens any private page is redirected to `/sign-in` **by the server, before the page loads**. Hiding content in the browser is not enough.
   - Test: sign out, then open a private page directly by its address (e.g. `/`, `/tags`, `/meetings/<id>`). It must redirect to `/sign-in`.
   - Signed-in visitors who open `/sign-in` or `/sign-up` go to `/`.
3. **Every item belongs to a user, and users see only their own.**
   - Every table that holds user data (meetings, tags, the meeting–tag link, settings) has a `user_id` and **Row Level Security turned on**, with policies that let each user select, insert, update, and delete only their own rows. This must hold even when the database is queried outside the app (e.g. directly with the anon key).
   - **No user data in `localStorage` or `sessionStorage`.** Everything is stored in Supabase.
4. **Create, edit, and delete work and persist.** Meetings (the main item) and tags can be created, edited, and deleted; changes are stored in Supabase and are still there after a page reload.

The existing features below must keep working on top of Supabase.

## Existing features (keep working)

- `/`: meeting log, newest first; each item links to its meeting page; trash button deletes (with confirmation).
- `/meetings/new`: form to log a meeting (name, date, participants, notes, tag chips); saving opens the new meeting's page.
- `/meetings/[id]`: one page per meeting (tab title = meeting name); Edit swaps in the prefilled form (Save changes / Cancel); delete returns to `/`. Unknown or other users' IDs show "Meeting not found".
- `/tags`: create tags (names unique per user, ignoring case), list sorted by name with meeting counts, rename in place (Enter saves, Escape cancels), delete (removes the tag from its meetings, keeps the meetings).
- `/statistics`: overview cards, meetings per month (12 months), most-met and not-met-lately people, meetings by tag and weekday. Only meetings dated up to today count. Plain CSS bars, no chart library.
- `/settings`: Light / Dark / System theme; backup export/import as JSON (import merges into the signed-in user's data).
- Sidebar on every private page: Log a meeting button, All meetings, Tags, Statistics, 8 most recent meetings, Settings, and (new) the signed-in email and Sign out. Collapses to a top bar on phones.
- **No blank screens:** empty states and not-found states always show a readable message; not-found states link back to `/`.

Out of scope this sprint: filtering meetings by tag, password reset, OAuth providers, deployment.

## Stack

- Next.js 16 (App Router, Cache Components)
- React 19, TypeScript, Tailwind CSS v4
- Supabase (Postgres, Auth) via `@supabase/supabase-js` and `@supabase/ssr` (cookie-based sessions for the App Router)

## Constraints

- **Never commit on your own.** Only commit (and push or open a PR) when the user explicitly asks. Approving a plan that mentions committing doesn't count. When work is done, leave the changes uncommitted and say they're ready to commit.
- **No new libraries without asking first** (runtime or dev). Propose the library and the reason, then wait for approval. `@supabase/supabase-js` and `@supabase/ssr` are the planned additions for this sprint; still confirm with the user before installing them.
- **No API routes for data access.** Read and write through the Supabase client (Server Components, Server Actions, or Client Components), relying on RLS for access control.
- **Secrets stay out of git.** Supabase URL and anon/publishable key go in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`); `.env*` is already gitignored. Commit a `.env.example` with empty values. Never use the service role key in the app.

## Auth

- Use `@supabase/ssr` with three helpers: a browser client, a server client (reads/writes cookies via `next/headers`), and the session-refresh helper used by the proxy.
- **Proxy** (`proxy.ts`, Next.js 16's replacement for `middleware.ts`; check the docs in `node_modules/next/dist/docs/`) refreshes the session cookie on every request and redirects signed-out visitors on private routes to `/sign-in`.
- **Don't rely on the proxy alone.** Every private page (or the private route group's layout) also checks the user on the server and calls `redirect("/sign-in")` if there is none.
- On the server, verify the user with `supabase.auth.getUser()` (or `getClaims()`), never `getSession()`, which trusts the cookie without validating it.
- Sign in, sign up, and sign out are Server Actions. Show readable errors (wrong password, email already registered, unconfirmed email).
- If email confirmation is on in the Supabase project, sign-up shows a "check your email" message; for local testing it can be turned off in the dashboard.

## Data model (Supabase)

Schema changes live as SQL migrations in `supabase/migrations/` (timestamped files) so the database can be recreated. Every table below has RLS **enabled** and four policies (select / insert / update / delete) with `user_id = auth.uid()` in `using` and `with check`.

- `meetings`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `name text not null`, `date date not null`, `participants text[] not null default '{}'`, `notes text not null default ''`, `created_at timestamptz default now()`, `updated_at timestamptz`.
- `tags`: `id`, `user_id`, `name text not null`; unique index on `(user_id, lower(name))`.
- `meeting_tags`: `meeting_id` → `meetings` (on delete cascade), `tag_id` → `tags` (on delete cascade), `user_id`; primary key `(meeting_id, tag_id)`. Deleting a tag removes it from meetings automatically.
- `user_settings`: `user_id pk`, `theme text check (theme in ('light','dark','system')) default 'system'`.
- Index every `user_id` and foreign-key column.

Data access goes through `lib/` modules (e.g. `lib/meetings.ts`, `lib/tags.ts`, `lib/settings.ts`) rather than ad-hoc queries in components. Never filter by user only in the app; RLS is the guarantee, app-side filters are just for clarity.

### Migrating from the localStorage version

- Remove all `localStorage`/`sessionStorage` use (`lib/meetings.ts`, `lib/tags.ts`, `lib/theme.ts`, `use-*` hooks, `requestPersistentStorage()` in `sidebar.tsx`).
- After a create, edit, or delete, refresh data with `revalidatePath`/`refresh()` (Server Actions) or by refetching, so pages kept alive by Cache Components (React `<Activity>`, see `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`) don't show stale data.
- Theme: read the user's `user_settings.theme` on the server and set `data-theme` on `<html>` in the root layout, so there's no flash of wrong colors. Signed-out pages use System.
- Existing users' browser data is not migrated automatically; they can export a backup from the old version and import it via Settings.

## Theming

- **Look:** "finance terminal": near-black (dark) or cool gray (light) surfaces, 1px hairline borders, small radii, compact rows, amber accent for primary buttons, the active menu item, and chart bars. Geist Mono for data and labels; Geist Sans for names, notes, and headings. The sign-in and sign-up pages use the same look.
- **Colors are semantic tokens** in `app/globals.css` (`bg`, `surface`, `surface-2`, `line`, `line-strong`, `fg`, `muted`, `faint`, `accent`, `accent-hover`, `on-accent`, `accent-fg`, `accent-soft`, `up`, `down`, `danger`, `danger-soft`), used as Tailwind colors. No raw palette colors like `zinc-*`, and no `dark:` classes except rare exceptions.
- `dark:` is a custom variant: dark applies when `<html data-theme="dark">`, or when the OS prefers dark and `data-theme` isn't `"light"`.
- **Shared class strings** live in `components/ui.ts` (`pageMain`, `buttonPrimary`, `buttonSecondary`, `buttonGhost`, `iconButton`, `input`, `panel`, `panelHeader`, `label`, `emptyState`, `textLink`, `errorBox`, `loadingText`). Reuse them. Pages use `<PageHeader>` (`components/page-header.tsx`).

## Commands

- `npm run dev`: dev server at http://localhost:3000
- `npm run build`: production build
- `npm run lint`: ESLint

## Verification checklist (run before calling the sprint done)

1. Sign up a new account (or create one in the dashboard) and sign in.
2. Create, edit, and delete a meeting and a tag; reload after each; changes persist.
3. Sign out; open `/`, `/tags`, `/statistics`, `/settings`, and a `/meetings/<id>` URL directly. Each redirects to `/sign-in`.
4. Sign in as a second account: none of the first account's meetings or tags are visible, and opening the first account's meeting URL shows "Meeting not found".
5. In the Supabase dashboard, every user-data table shows RLS enabled. With the anon key and no session, selects return no rows.
6. DevTools → Application: `localStorage` and `sessionStorage` hold no app data.
7. `npm run lint` and `npm run build` pass.

## Project structure

- `app/`: App Router pages and layouts (`layout.tsx`, `not-found.tsx`, `globals.css`)
  - `sign-in/`, `sign-up/`: public auth pages
  - private pages: `page.tsx` (`/`), `meetings/new`, `meetings/[id]`, `tags`, `statistics`, `settings` (consider grouping them in a `(private)` route group whose layout checks the user and renders the sidebar)
- `proxy.ts`: session refresh and redirect for signed-out visitors
- `components/`: UI components (`meeting-log`, `meeting-form`, `meeting-detail`, `meeting-list`, `new-meeting`, `date-picker`, `delete-button`, `delete-meeting-button`, `tags-manager`, `meeting-tags`, `statistics`, `settings`, `sidebar`, `page-header`, `ui.ts`)
- `lib/supabase/`: browser client, server client, and proxy session helper
- `lib/`: data access (`meetings.ts`, `tags.ts`, `settings.ts`), `statistics.ts` (pure `computeStatistics()`), `backup.ts` (backup format), `format-date.ts`
- `supabase/migrations/`: SQL schema, RLS policies, indexes
- `docs/screenshot.png`: README screenshot; retake when the look changes noticeably

## Keeping this file current

Update this file as the app evolves: when features, structure, conventions, or decisions change, reflect them here in the same change. `README.md` still describes the localStorage version on purpose; it gets rewritten once at the end of the sprint, so don't update it piecemeal before then.
