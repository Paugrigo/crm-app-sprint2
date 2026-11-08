-- Server-side meeting search: the database returns only the meetings that match, instead of
-- the browser downloading everything and filtering it.
--
-- A meeting matches when the search text appears (case-insensitive, anywhere in the text) in
-- its name, its notes, any participant, or the name of any of its tags. Substring matching
-- rather than full-text search on purpose: people search for parts of names ("Jon" should find
-- "Jonas"), and names aren't English words for a text-search dictionary to stem.
--
-- security invoker: the function runs as the caller, so Row Level Security applies exactly as
-- for a plain select. The explicit user_id filter is only there so the planner can use
-- meetings_user_id_date_idx; RLS is still the guarantee.
--
-- Called from the app with supabase.rpc('search_meetings', { search }). It returns
-- setof public.meetings, so the caller can embed meeting_tags and order the result.

create function public.search_meetings(search text)
returns setof public.meetings
language sql
stable
security invoker
set search_path = ''
as $$
  with pattern as (
    -- Escape LIKE wildcards so "%" or "_" in the search text match literally.
    select '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      as value
  )
  select m.*
  from public.meetings m, pattern
  where m.user_id = (select auth.uid())
    and (
      m.name ilike pattern.value
      or m.notes ilike pattern.value
      or exists (
        select 1 from unnest(m.participants) as participant
        where participant ilike pattern.value
      )
      or exists (
        select 1
        from public.meeting_tags mt
        join public.tags t on t.id = mt.tag_id
        where mt.meeting_id = m.id and t.name ilike pattern.value
      )
    );
$$;

comment on function public.search_meetings(text) is
  'Signed-in user''s meetings whose name, notes, participants, or tag names contain the search text (case-insensitive).';

-- Signed-in users only, like the tables.
revoke execute on function public.search_meetings(text) from public, anon;
grant execute on function public.search_meetings(text) to authenticated;
