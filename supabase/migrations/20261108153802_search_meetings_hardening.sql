-- Hardens search_meetings(...) from 20261108152443_search_meetings_filters.sql:
--
--   * A null tags_match_all / participants_match_all now means "any" (false). Before, null made
--     the tag or participant condition null, so no meeting matched.
--   * Participant names compare ignoring surrounding whitespace on both sides, so a stored
--     "Jonas " (e.g. from an old backup) matches a "Jonas" filter.
--
-- Same signature, so `create or replace` keeps the grants (execute for authenticated only).
-- Everything else is unchanged: security invoker (RLS applies), explicit user_id filter for
-- the index, every parameter optional.

create or replace function public.search_meetings(
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
      coalesce(tags_match_all, false) as all_tags,
      (
        select array_agg(distinct lower(btrim(p)))
        from unnest(search_meetings.participants) as p
        where btrim(p) <> ''
      ) as people,
      coalesce(participants_match_all, false) as all_people
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
        not params.all_tags
        and exists (
          select 1 from public.meeting_tags mt
          where mt.meeting_id = m.id and mt.tag_id = any (tag_ids)
        )
      )
      or (
        params.all_tags
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
      params.people is null
      or (
        not params.all_people
        and exists (
          select 1 from unnest(m.participants) as participant
          where lower(btrim(participant)) = any (params.people)
        )
      )
      or (
        params.all_people
        and not exists (
          select 1 from unnest(params.people) as wanted(name)
          where not exists (
            select 1 from unnest(m.participants) as participant
            where lower(btrim(participant)) = wanted.name
          )
        )
      )
    );
$$;
