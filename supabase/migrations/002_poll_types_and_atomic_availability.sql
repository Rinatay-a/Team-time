-- «Время команды» 2.0. Применять только после резервной копии и 001_initial.sql.
-- Все существующие встречи, UUID, токены и слоты сохраняются.

create type public.poll_type as enum ('availability', 'meeting');

alter table public.meetings
  add column poll_type public.poll_type not null default 'meeting';

alter table public.meetings alter column meeting_duration drop not null;

alter table public.meetings add constraint meetings_duration_matches_type check (
  (poll_type = 'availability' and meeting_duration is null and finalized_start is null and finalized_end is null)
  or
  (poll_type = 'meeting' and meeting_duration is not null)
);

-- Атомарно создаёт/обновляет ответ и полностью заменяет слоты в одной транзакции.
-- Вызывается только Edge Function с service_role. Хеш токена приходит с доверенного сервера.
create or replace function public.save_participant_availability_atomic(
  p_meeting_id uuid,
  p_display_name text,
  p_token_hash text,
  p_expected_updated_at timestamptz,
  p_slots jsonb
) returns table(participant_id uuid, participant_updated_at timestamptz, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.participants%rowtype;
  v_created boolean := false;
begin
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array';
  end if;

  select * into v_participant
  from public.participants
  where meeting_id = p_meeting_id and edit_token_hash = p_token_hash
  for update;

  if found then
    if p_expected_updated_at is not null
       and abs(extract(epoch from (v_participant.updated_at - p_expected_updated_at))) > 0.001 then
      raise exception using errcode = '40001', message = 'availability_conflict';
    end if;
    update public.participants
      set display_name = p_display_name, updated_at = clock_timestamp()
      where id = v_participant.id
      returning * into v_participant;
  else
    insert into public.participants(meeting_id, display_name, edit_token_hash)
      values(p_meeting_id, p_display_name, p_token_hash)
      returning * into v_participant;
    v_created := true;
  end if;

  delete from public.availability_slots where participant_id = v_participant.id;

  insert into public.availability_slots(participant_id, meeting_id, slot_key, starts_at, ends_at)
  select v_participant.id, p_meeting_id, item->>'slot_key',
         (item->>'starts_at')::timestamptz, (item->>'ends_at')::timestamptz
  from jsonb_array_elements(p_slots) item;

  return query select v_participant.id, v_participant.updated_at, v_created;
end;
$$;

revoke all on function public.save_participant_availability_atomic(uuid,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.save_participant_availability_atomic(uuid,text,text,timestamptz,jsonb) to service_role;

-- Снимки возвращаются одной JSON-строкой и не обрезаются стандартным лимитом
-- PostgREST в 1000 строк. Доступны только серверной роли.
create or replace function public.get_meeting_participants_snapshot(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'updated_at', p.updated_at,
    'slots', coalesce((select jsonb_agg(s.slot_key order by s.starts_at)
                       from public.availability_slots s where s.participant_id = p.id), '[]'::jsonb)
  ) order by p.created_at), '[]'::jsonb)
  from public.participants p where p.meeting_id = p_meeting_id;
$$;

create or replace function public.get_participant_snapshot(p_meeting_id uuid, p_token_hash text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'updated_at', p.updated_at,
    'slots', coalesce((select jsonb_agg(s.slot_key order by s.starts_at)
                       from public.availability_slots s where s.participant_id = p.id), '[]'::jsonb)
  ) from public.participants p
  where p.meeting_id = p_meeting_id and p.edit_token_hash = p_token_hash;
$$;

revoke all on function public.get_meeting_participants_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_participant_snapshot(uuid,text) from public, anon, authenticated;
grant execute on function public.get_meeting_participants_snapshot(uuid) to service_role;
grant execute on function public.get_participant_snapshot(uuid,text) to service_role;

create index if not exists meetings_organizer_poll_type_idx
  on public.meetings(organizer_id, poll_type, created_at desc);
