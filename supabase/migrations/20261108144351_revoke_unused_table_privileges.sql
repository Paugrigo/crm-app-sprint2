-- Supabase's default privileges also give `authenticated` TRUNCATE, REFERENCES, and TRIGGER on
-- new tables. The app never needs them, and TRUNCATE ignores Row Level Security, so take them
-- away: signed-in users keep only the SELECT/INSERT/UPDATE/DELETE grants from the initial
-- schema, which RLS limits to their own rows.

revoke truncate, references, trigger
  on public.meetings, public.tags, public.meeting_tags, public.user_settings
  from authenticated;
