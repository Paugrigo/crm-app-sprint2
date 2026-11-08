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
- Search and filters on `/`: a search box plus a row of filter dropdowns (Tags, Date, People, Clear all), all applied **in the database** (only matching rows are downloaded). Text: case-insensitive substring match on name, notes, participants, and tag names (Enter searches at once, Escape clears, 250 ms debounce). Tags and People: multi-select with an Any/All switch. Date: This month, This year, Upcoming, Past only, or a custom from/to range (presets resolve in the visitor's local calendar at query time). Everything lives in the URL (`q`, repeated `tag`/`person`, `tags=all`, `people=all`, `date` or `from`/`to`; see `lib/meeting-filters.ts`), written with `history.replaceState`. Old results stay visible, dimmed, while new ones load (`useDeferredValue`). No matches shows a readable message with a clear button.
- `/meetings/new`: form to log a meeting (name, date, participants, notes, tag chips); saving opens the new meeting's page.
- `/meetings/[id]`: one page per meeting (tab title = meeting name); Edit swaps in the prefilled form (Save changes / Cancel); delete returns to `/`. Unknown or other users' IDs show "Meeting not found".
- `/tags`: create tags (names unique per user, ignoring case), list sorted by name with meeting counts, rename in place (Enter saves, Escape cancels), delete (removes the tag from its meetings, keeps the meetings).
- `/statistics`: overview cards, meetings per month (12 months), most-met and not-met-lately people, meetings by tag and weekday. Only meetings dated up to today count. Plain CSS bars, no chart library.
- `/settings`: Light / Dark / System theme (saved per user); backup export/import as JSON (import merges into the signed-in user's data).
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
- **Secrets stay out of git.** Supabase URL and publishable key go in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `.env*` is already gitignored. Commit a `.env.example` with empty values. Never use the service role key in the app.

## Auth

- `@supabase/ssr` helpers in `lib/supabase/`: `client.ts` (browser client), `server.ts` (`createClient()` for Server Components/Actions/Route Handlers, plus `getCurrentUser()`), `proxy.ts` (`updateSession()`).
- **Proxy** (`proxy.ts`, Next.js 16's replacement for `middleware.ts`) runs before every request except static assets: refreshes the session cookies, redirects signed-out visitors on any non-public path to `/sign-in?next=<path>` (HTTP 307), and sends signed-in visitors from `/sign-in`/`/sign-up` to `/`. Public paths: `/sign-in`, `/sign-up`, `/auth/confirm`.
- **Second check:** `app/(private)/layout.tsx` verifies the user on the server (`getCurrentUser()`) and redirects if there is none. Keep both.
- On the server, verify with `getClaims()` (or `getUser()`), never `getSession()`.
- Sign in, sign up, and sign out are Server Actions (`lib/auth-actions.ts`) returning readable errors. After success the client does a **full page load** (`window.location.assign`), not `router.push`: it clears the in-memory data stores and the pages Next.js keeps alive, so one user's data can't flash for the next. Sign-out uses `scope: "local"` (only this browser) and reports failure instead of redirecting.
- Email confirmation is **on** in the project: sign-up shows "check your email", and the email link lands on `app/auth/confirm/route.ts`, which exchanges it for a session. The link must be opened in the same browser. Supabase's built-in email sender is rate-limited (a few emails per hour); for testing, create users in the dashboard (Authentication → Add user, with Auto Confirm) or turn confirmation off.

## Data model (Supabase)

Schema changes live as SQL migrations in `supabase/migrations/` (timestamped files) so the database can be recreated; the schema is in `20261108120000_initial_schema.sql`. Never edit an applied migration; add a new one. Every user-data table has a `user_id` (defaults to `auth.uid()`, cascades when the user is deleted), RLS **enabled**, and policies for the `authenticated` role only, comparing `(select auth.uid()) = user_id`. The `anon` role has no table privileges; `authenticated` has only select/insert/update/delete (TRUNCATE, REFERENCES, TRIGGER revoked in `20261108144351_revoke_unused_table_privileges.sql`, since TRUNCATE ignores RLS).

- `meetings`: `id`, `user_id`, `name` (1–200 chars), `date`, `participants text[]`, `notes`, `created_at`, `updated_at` (set by trigger). Indexed on `(user_id, date desc, created_at desc)`.
- `tags`: `id`, `user_id`, `name` (1–40 chars); unique per user ignoring case (unique index on `(user_id, lower(name))`, so a duplicate insert fails with Postgres error `23505`).
- `meeting_tags`: `meeting_id`, `tag_id` (both `on delete cascade`, so deleting a tag takes it off meetings), `user_id`; primary key `(meeting_id, tag_id)`. The insert policy also requires the meeting and the tag to be the user's own. No update policy or grant: change a meeting's tags by deleting and inserting links (no upserts).
- `search_meetings(search, tag_ids, tags_match_all, participants, participants_match_all, date_from, date_to)`: SQL function (`security invoker`, so RLS applies) returning `setof meetings`; every parameter is optional (null = no filter) and all given conditions must hold. LIKE wildcards in the search text are escaped; participant names compare case-insensitively as whole names, ignoring surrounding spaces; a null `*_match_all` means any. (Hardened in `20261108153802_search_meetings_hardening.sql`.) Execute granted to `authenticated` only. Called with `supabase.rpc(...).select(...)` (select `created_at` too: PostgREST only orders a function's results by selected columns).
- `user_settings`: `user_id` (primary key), `theme` (`light` / `dark` / `system`, default `system`). A missing row means defaults.

Never rely on app-side filtering for privacy; RLS is the guarantee.

### Reading and writing data in the app

- Data is read and written from Client Components with the browser Supabase client, as the signed-in user, so RLS applies. Each table has a module with its CRUD functions: `lib/meetings.ts` (`useMeetings`, `useMeetingSearch`, `createMeeting`, `updateMeeting`, `deleteMeeting`), `lib/tags.ts` (`useTags`, `createTag`, `renameTag`, `deleteTag`), `lib/theme.ts` (`useThemePreference`, `saveThemePreference`), `lib/backup.ts` (`saveImport`). Don't query Supabase from components directly.
- Reads go through `createRemoteStore()` (`lib/remote-store.ts`): one in-memory copy per table shared by all components via `useSyncExternalStore`. Every mutation refetches its store afterwards (also on failure), so every mounted page, including ones Next.js keeps hidden (React `<Activity>`, see `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`), shows current data. Never copy data into `useState`. Data that depends on a parameter (search results per term) uses `createKeyedRemoteStore()`: one store per key, at most 20 cached beyond those on screen or loading (least recently used dropped first); a refresh reloads the keys on screen and drops the rest. A store shown again after nobody read it refetches in the background if its data is older than 30s. `refreshMeetings()` reloads meetings and search results; tag renames and deletes call it too, since search matches tag names. Stores also refetch when the tab becomes visible again (at most every 30s), which picks up changes from other tabs.
- Components that read stores call `use(browser(...))` and render inside `<Suspense>`. The first load suspends; a failed load throws to `app/error.tsx` ("Couldn't load your data" + Try again). A failed first load keeps its rejected promise (clearing it would make React refetch and suspend forever); Try again calls `resetFailedLoads()` first. Failed mutations show an inline error (`describeError()` for the message).
- Nothing is stored in `localStorage`/`sessionStorage`. One exception to "Supabase only": the theme choice is also copied into a `crm-theme` cookie (`lib/theme-cookie.ts`) so an inline script in the root layout can apply it before the first paint (no flash). `user_settings.theme` stays the source of truth: `components/theme-applier.tsx` re-applies it (and rewrites the cookie) after it loads, and sign-out deletes the cookie.
- Stores always call `use()` (also after loading, with an already-resolved promise): React requires the same `use()` calls in the render after a suspension.
- `getCurrentUser()` calls `connection()` first: session checks use `Date.now()`, which Next.js forbids during prerendering.
- Old browser-only data isn't migrated automatically: export a backup from the old version and import it in Settings. Import (`localizeBackup()` in `lib/backup.ts`) keeps IDs of the user's own items and replaces other IDs with one derived from the user ID and the original ID, so the same file can go into several accounts without ID clashes, and re-importing it updates instead of duplicating.

## Theming

- **Look:** "finance terminal": near-black (dark) or cool gray (light) surfaces, 1px hairline borders, small radii, compact rows, amber accent for primary buttons, the active menu item, and chart bars. Geist Mono for data and labels; Geist Sans for names, notes, and headings. The sign-in and sign-up pages use the same look.
- **Colors are semantic tokens** in `app/globals.css` (`bg`, `surface`, `surface-2`, `line`, `line-strong`, `fg`, `muted`, `faint`, `accent`, `accent-hover`, `on-accent`, `accent-fg`, `accent-soft`, `up`, `down`, `danger`, `danger-soft`), used as Tailwind colors. No raw palette colors like `zinc-*`, and no `dark:` classes except rare exceptions.
- `dark:` is a custom variant: dark applies when `<html data-theme="dark">`, or when the OS prefers dark and `data-theme` isn't `"light"`.
- **Shared class strings** live in `components/ui.ts` (`pageMain`, `buttonPrimary`, `buttonSecondary`, `buttonGhost`, `iconButton`, `input`, `panel`, `panelHeader`, `label`, `emptyState`, `textLink`, `errorBox`, `loadingText`). Reuse them. Pages use `<PageHeader>` (`components/page-header.tsx`).

## Commands

- `npm run dev`: dev server at http://localhost:3000
- `npm run build`: production build
- `npm run lint`: ESLint
- Supabase CLI (v3, installed via Homebrew; project linked as `ddsulpggdjayrwquvrxy`). It targets a local Docker database by default, so pass `--remote` for the linked project:
  - `supabase migration new <name>`: create a migration file
  - `supabase db push --remote --dry-run`, then `supabase db push --remote`: apply pending migrations (ask the user before pushing)
  - `supabase migration list --remote`: what's applied
  - `supabase db query --remote --read-only "<sql>"`: inspect the database

## Verification checklist (run before calling the sprint done)

1. Sign up a new account (or create one in the dashboard) and sign in.
2. Create, edit, and delete a meeting and a tag; reload after each; changes persist.
3. Sign out; open `/`, `/tags`, `/statistics`, `/settings`, and a `/meetings/<id>` URL directly. Each redirects to `/sign-in`.
4. Sign in as a second account: none of the first account's meetings or tags are visible, and opening the first account's meeting URL shows "Meeting not found".
5. In the Supabase dashboard, every user-data table shows RLS enabled. With the anon key and no session, selects return no rows.
6. DevTools → Application: `localStorage` and `sessionStorage` hold no app data.
7. `npm run lint` and `npm run build` pass.

## Project structure

- `app/`: `layout.tsx` (document only), `not-found.tsx`, `error.tsx` (data load errors), `globals.css`
  - `(auth)/`: public pages without the sidebar: `sign-in/`, `sign-up/` (both render `components/auth-form.tsx`)
  - `(private)/`: `layout.tsx` (server user check, sidebar, theme), `page.tsx` (`/`), `meetings/new`, `meetings/[id]`, `tags`, `statistics`, `settings`. Route groups don't change URLs.
  - `auth/confirm/route.ts`: email confirmation link handler
- `proxy.ts`: server-side gate (see Auth)
- `components/`: `meeting-log` (search box + results), `meeting-filter-bar`, `meeting-form`, `meeting-detail`, `meeting-list`, `new-meeting`, `date-picker`, `delete-button`, `delete-meeting-button`, `tags-manager`, `meeting-tags`, `statistics`, `settings`, `sidebar` (menu, signed-in email, Sign out), `auth-form`, `theme-applier`, `inline-script` (pre-paint theme script), `page-header`, `ui.ts`
- `lib/supabase/`: `env.ts`, `client.ts`, `server.ts`, `proxy.ts`
- `lib/`: `auth-actions.ts`, `remote-store.ts`, `meeting-filters.ts` (URL ⇄ filters, date presets), data modules (`meetings.ts`, `tags.ts`, `theme.ts`, `backup.ts`), `theme-cookie.ts`, `statistics.ts` (pure `computeStatistics()`), `format-date.ts`
- `supabase/`: `config.toml` (CLI), `migrations/` (schema, RLS policies, indexes)
- `docs/screenshot.png`: README screenshot; retake when the look changes noticeably

## Keeping this file current

Update this file as the app evolves: when features, structure, conventions, or decisions change, reflect them here in the same change. `README.md` still describes the localStorage version on purpose; it gets rewritten once at the end of the sprint, so don't update it piecemeal before then.
