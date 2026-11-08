-- Signed-in users need only select, insert, update, and delete on the user-data tables.
-- 20261108144351_revoke_unused_table_privileges.sql revoked TRUNCATE, REFERENCES, and TRIGGER,
-- but not MAINTAIN (new in Postgres 17, granted by Supabase's default privileges). MAINTAIN
-- allows VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, and LOCK TABLE, none of
-- which Row Level Security checks. The app's API can't issue those commands, but nothing here
-- needs the privilege, so remove it.

revoke maintain
  on public.meetings, public.tags, public.meeting_tags, public.user_settings
  from authenticated;
