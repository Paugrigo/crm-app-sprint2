-- Everyone in the signed-in user's meetings, with how many meetings each one is in, for the
-- People filter on the meeting log. Before, the app downloaded every meeting to work this out.
--
-- Names are free text, so they're grouped the way search_meetings compares them: ignoring case
-- and surrounding spaces. Each group shows the spelling from the newest meeting.
--
-- security invoker: RLS applies, so only the user's own meetings are read. The explicit user_id
-- filter lets the planner use meetings_user_id_date_idx.

create function public.meeting_participants()
returns table (name text, meetings bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (array_agg(btrim(p.name) order by m.date desc, m.created_at desc))[1] as name,
    count(*) as meetings
  from public.meetings m
  cross join lateral unnest(m.participants) as p(name)
  where m.user_id = (select auth.uid())
    and btrim(p.name) <> ''
  group by lower(btrim(p.name));
$$;

comment on function public.meeting_participants() is
  'Participant names in the signed-in user''s meetings (grouped ignoring case and surrounding spaces) with their meeting counts.';

revoke execute on function public.meeting_participants() from public, anon;
grant execute on function public.meeting_participants() to authenticated;
