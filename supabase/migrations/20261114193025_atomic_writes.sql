-- Saves that used to be several requests from the browser, as one function call each, so they
-- either finish completely or change nothing (a function call runs in one transaction):
--
--   * save_meeting(...): creates or updates a meeting and sets its tags. Before, the app sent
--     3–4 requests, and a failure partway left a meeting with the wrong tags (or, on create, an
--     undo-delete whose own failure went unnoticed).
--   * import_backup(...): writes a backup import. Before, the app sent one or two requests per
--     meeting, one after another, and a failure partway left a half-finished import.
--
-- ON CONFLICT names the primary key constraint rather than its columns: in PL/pgSQL, the
-- column meeting_id would be ambiguous with save_meeting's parameter of the same name.
--
-- Both are `security invoker`: they run as the signed-in user, so Row Level Security applies to
-- every statement exactly as it does to the app's own requests. Tag IDs that aren't the user's
-- own tags (another user's, or deleted) are skipped rather than linked, the same way the
-- meeting_tags insert policy would refuse them.

-- ---------------------------------------------------------------------------
-- save_meeting
-- ---------------------------------------------------------------------------

create function public.save_meeting(
  meeting_id uuid,
  name text,
  date date,
  participants text[],
  notes text,
  tag_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if save_meeting.meeting_id is null then
    insert into public.meetings (name, date, participants, notes)
    values (
      save_meeting.name,
      save_meeting.date,
      coalesce(save_meeting.participants, '{}'),
      coalesce(save_meeting.notes, '')
    )
    returning id into saved_id;
  else
    -- RLS hides other users' meetings, so their IDs update nothing, like unknown IDs.
    update public.meetings m
    set
      name = save_meeting.name,
      date = save_meeting.date,
      participants = coalesce(save_meeting.participants, '{}'),
      notes = coalesce(save_meeting.notes, '')
    where m.id = save_meeting.meeting_id
    returning m.id into saved_id;

    if saved_id is null then
      raise exception 'Meeting not found. It may have been deleted.' using errcode = 'P0002';
    end if;
  end if;

  -- Set the meeting's tags to exactly tag_ids (only the user's own tags; RLS on tags hides the rest).
  delete from public.meeting_tags mt
  where mt.meeting_id = saved_id
    and not (mt.tag_id = any (coalesce(save_meeting.tag_ids, '{}')));

  insert into public.meeting_tags (meeting_id, tag_id)
  select saved_id, t.id
  from public.tags t
  where t.id = any (coalesce(save_meeting.tag_ids, '{}'))
  on conflict on constraint meeting_tags_pkey do nothing;

  return saved_id;
end;
$$;

comment on function public.save_meeting(uuid, text, date, text[], text, uuid[]) is
  'Creates (meeting_id null) or updates a meeting of the signed-in user and sets its tags, in one transaction. Returns the meeting ID.';

-- ---------------------------------------------------------------------------
-- import_backup
-- ---------------------------------------------------------------------------
-- The app works out what to write (lib/backup.ts, mergeBackup) and passes only the changes:
--
--   changed_tags      [{ "id", "name" }]: new or renamed tags
--   changed_meetings  [{ "id", "name", "date", "participants", "notes", "tag_ids" }]: new or
--                     changed meetings; each one's tags are set to exactly tag_ids
--   tag_merges        [{ "from", "to" }]: existing tags merged into another tag with the same
--                     name; every meeting with `from` gets `to` instead, then `from` is deleted

create function public.import_backup(
  changed_tags jsonb default '[]',
  changed_meetings jsonb default '[]',
  tag_merges jsonb default '[]'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.tags (id, name)
  select t.id, t.name
  from jsonb_to_recordset(coalesce(import_backup.changed_tags, '[]')) as t(id uuid, name text)
  on conflict (id) do update set name = excluded.name;

  insert into public.meetings (id, name, date, participants, notes)
  select m.id, m.name, m.date, coalesce(m.participants, '{}'), coalesce(m.notes, '')
  from jsonb_to_recordset(coalesce(import_backup.changed_meetings, '[]'))
    as m(id uuid, name text, date date, participants text[], notes text)
  on conflict (id) do update set
    name = excluded.name,
    date = excluded.date,
    participants = excluded.participants,
    notes = excluded.notes;

  -- Set each changed meeting's tags to exactly its tag_ids (only the user's own tags).
  with incoming as (
    select m.id, coalesce(m.tag_ids, '{}') as tag_ids
    from jsonb_to_recordset(coalesce(import_backup.changed_meetings, '[]')) as m(id uuid, tag_ids uuid[])
  )
  delete from public.meeting_tags mt
  using incoming
  where mt.meeting_id = incoming.id
    and not (mt.tag_id = any (incoming.tag_ids));

  insert into public.meeting_tags (meeting_id, tag_id)
  select m.id, t.id
  from jsonb_to_recordset(coalesce(import_backup.changed_meetings, '[]')) as m(id uuid, tag_ids uuid[])
  join public.tags t on t.id = any (m.tag_ids)
  on conflict on constraint meeting_tags_pkey do nothing;

  -- Merged tags: move their links (also on meetings that weren't in the import), then delete
  -- them. Deleting a tag removes its remaining links (on delete cascade).
  with merges as (
    select g."from", g."to"
    from jsonb_to_recordset(coalesce(import_backup.tag_merges, '[]')) as g("from" uuid, "to" uuid)
  )
  insert into public.meeting_tags (meeting_id, tag_id)
  select mt.meeting_id, merges."to"
  from public.meeting_tags mt
  join merges on merges."from" = mt.tag_id
  on conflict on constraint meeting_tags_pkey do nothing;

  delete from public.tags t
  where t.id in (
    select g."from"
    from jsonb_to_recordset(coalesce(import_backup.tag_merges, '[]')) as g("from" uuid)
  );
end;
$$;

comment on function public.import_backup(jsonb, jsonb, jsonb) is
  'Writes a backup import for the signed-in user (tags, meetings, their tag links, merged tags) in one transaction. See lib/backup.ts.';

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only (Supabase grants execute to anon by default)
-- ---------------------------------------------------------------------------

revoke execute on function public.save_meeting(uuid, text, date, text[], text, uuid[]) from public, anon;
grant execute on function public.save_meeting(uuid, text, date, text[], text, uuid[]) to authenticated;

revoke execute on function public.import_backup(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_backup(jsonb, jsonb, jsonb) to authenticated;
