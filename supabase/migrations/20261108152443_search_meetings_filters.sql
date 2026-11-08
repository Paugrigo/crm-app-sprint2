-- Adds filters to the meeting search, all applied in the database: tags, participants, and a
-- date range, each optional, combined with the search text (every given condition must hold).
--
-- Replaces search_meetings(text) from 20261108150906_search_meetings.sql with a version that
-- takes the filters as extra parameters. Same rules as before: security invoker (RLS applies),
-- explicit user_id filter for the index, signed-in users only.
--
-- Parameters (null or empty means "don't filter on this"):
--   search                  text that must appear (case-insensitive) in the name, notes, a
--                           participant, or a tag name; LIKE wildcards in it match literally
--   tag_ids                 the meeting has any of these tags, or all of them if tags_match_all
--   participants            the meeting has any of these people, or all of them if
--                           participants_match_all; names compare case-insensitively, whole name
--   date_from, date_to      inclusive date range; either end may be open

drop function public.search_meetings(text);

create function public.search_meetings(
  search text default null,
  tag_ids uuid[] default null,
  tags_match_all boolean default false,
  participants text[] default null,
  participants_match_all boolean default false,
  date_from date default null,
  date_to date default null
)
returns setof public.meetings
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      case
        when coalesce(btrim(search_meetings.search), '') = '' then null
        -- Escape LIKE wildcards so "%" or "_" in the search text match literally.
        else '%' || replace(replace(replace(btrim(search_meetings.search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern,
      coalesce(cardinality(tag_ids), 0) > 0 as by_tags,
      coalesce(cardinality(search_meetings.participants), 0) > 0 as by_people,
      (select array_agg(lower(p)) from unnest(search_meetings.participants) as p) as people
  )
  select m.*
  from public.meetings m, params
  where m.user_id = (select auth.uid())
    and (date_from is null or m.date >= date_from)
    and (date_to is null or m.date <= date_to)
    and (
      params.pattern is null
      or m.name ilike params.pattern
      or m.notes ilike params.pattern
      or exists (
        select 1 from unnest(m.participants) as participant
        where participant ilike params.pattern
      )
      or exists (
        select 1
        from public.meeting_tags mt
        join public.tags t on t.id = mt.tag_id
        where mt.meeting_id = m.id and t.name ilike params.pattern
      )
    )
    and (
      not params.by_tags
      or (
        not tags_match_all
        and exists (
          select 1 from public.meeting_tags mt
          where mt.meeting_id = m.id and mt.tag_id = any (tag_ids)
        )
      )
      or (
        tags_match_all
        and not exists (
          select 1 from unnest(tag_ids) as wanted(tag_id)
          where not exists (
            select 1 from public.meeting_tags mt
            where mt.meeting_id = m.id and mt.tag_id = wanted.tag_id
          )
        )
      )
    )
    and (
      not params.by_people
      or (
        not participants_match_all
        and exists (
          select 1 from unnest(m.participants) as participant
          where lower(participant) = any (params.people)
        )
      )
      or (
        participants_match_all
        and not exists (
          select 1 from unnest(params.people) as wanted(name)
          where not exists (
            select 1 from unnest(m.participants) as participant
            where lower(participant) = wanted.name
          )
        )
      )
    );
$$;

comment on function public.search_meetings(text, uuid[], boolean, text[], boolean, date, date) is
  'Signed-in user''s meetings matching optional search text, tags (any/all), participants (any/all), and date range.';

-- Signed-in users only, like the tables.
revoke execute on function public.search_meetings(text, uuid[], boolean, text[], boolean, date, date)
  from public, anon;
grant execute on function public.search_meetings(text, uuid[], boolean, text[], boolean, date, date)
  to authenticated;
