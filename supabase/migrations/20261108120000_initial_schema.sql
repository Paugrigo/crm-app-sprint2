-- Initial schema for the CRM app: meetings, tags, the meeting-tag link, and user settings.
--
-- Every table holds user data, so every table:
--   * has a user_id that defaults to the signed-in user (auth.uid()) and is deleted with the user,
--   * has Row Level Security enabled,
--   * has policies limited to the `authenticated` role that only reach rows where user_id = auth.uid().
-- The `anon` role (signed-out visitors using the publishable key) gets no table privileges at all.
--
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query, not once per row.

-- ---------------------------------------------------------------------------
-- Helper: keep updated_at current
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  date date not null,
  participants text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meetings is 'Logged meetings. Each row belongs to one user (user_id).';
comment on column public.meetings.participants is 'Free-text participant names, in the order entered.';

-- Serves the meeting log (own meetings, newest first) and the user_id RLS filter.
create index meetings_user_id_date_idx on public.meetings (user_id, date desc, created_at desc);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

alter table public.meetings enable row level security;

create policy "Users read own meetings" on public.meetings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own meetings" on public.meetings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own meetings" on public.meetings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own meetings" on public.meetings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

comment on table public.tags is 'Tags a user can put on their meetings. Names are unique per user, ignoring case.';

-- Tag names are unique per user, ignoring case. Also serves the user_id RLS filter.
create unique index tags_user_id_lower_name_key on public.tags (user_id, lower(name));

alter table public.tags enable row level security;

create policy "Users read own tags" on public.tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own tags" on public.tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own tags" on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own tags" on public.tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- meeting_tags: which tags are on which meetings
-- ---------------------------------------------------------------------------
-- Deleting a meeting or a tag removes its links (on delete cascade), so deleting a tag
-- takes it off every meeting but keeps the meetings.

create table public.meeting_tags (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, tag_id)
);

comment on table public.meeting_tags is 'Links meetings to tags. Both must belong to the same user as the link.';

-- The primary key covers lookups by meeting_id; these cover tag_id (tag counts, cascades) and user_id (RLS).
create index meeting_tags_tag_id_idx on public.meeting_tags (tag_id);
create index meeting_tags_user_id_idx on public.meeting_tags (user_id);

alter table public.meeting_tags enable row level security;

create policy "Users read own meeting tags" on public.meeting_tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Matching user_id is not enough here: a user could otherwise link their meeting to someone
-- else's tag (or the other way round) by ID. So both ends must be the user's own rows too.
create policy "Users link own meetings and tags" on public.meeting_tags
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_id and m.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tags t
      where t.id = tag_id and t.user_id = (select auth.uid())
    )
  );

create policy "Users unlink own meeting tags" on public.meeting_tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No update policy on purpose: links are only added or removed, never changed, so updates are denied.

-- ---------------------------------------------------------------------------
-- user_settings: one row per user
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

comment on table public.user_settings is 'Per-user preferences. A missing row means all defaults.';

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

create policy "Users read own settings" on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own settings" on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own settings" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own settings" on public.user_settings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only. RLS above limits them to their own rows.
-- ---------------------------------------------------------------------------

revoke all on public.meetings, public.tags, public.meeting_tags, public.user_settings from anon;

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, delete on public.meeting_tags to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
