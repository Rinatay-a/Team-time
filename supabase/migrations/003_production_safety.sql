-- Keep 001/002 and existing responses intact. Fix the ambiguous participant_id
-- reference (also an OUT parameter) in the original atomic save function.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace function public.save_participant_availability_atomic(
  p_meeting_id uuid,
  p_display_name text,
  p_token_hash text,
  p_expected_updated_at timestamptz,
  p_slots jsonb
) returns table(participant_id uuid, participant_updated_at timestamptz, created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_participant public.participants%rowtype;
  v_created boolean := false;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array';
  end if;

  -- Closing/deleting the poll must not race with an in-flight save.
  perform 1 from public.meetings m
    where m.id = p_meeting_id and m.status = 'collecting' for share;
  if not found then
    raise exception 'Сбор ответов закрыт или опрос удалён';
  end if;

  -- Serialize retries of the same first save before a participant row exists.
  perform pg_advisory_xact_lock(hashtextextended(p_meeting_id::text || p_token_hash, 0));
  select p.* into v_participant from public.participants p
    where p.meeting_id = p_meeting_id and p.edit_token_hash = p_token_hash for update;

  if found then
    if p_expected_updated_at is not null and v_participant.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'availability_conflict';
    end if;
    update public.participants p set display_name = p_display_name
      where p.id = v_participant.id returning p.* into v_participant;
  else
    insert into public.participants(meeting_id, display_name, edit_token_hash)
      values(p_meeting_id, p_display_name, p_token_hash) returning * into v_participant;
    v_created := true;
  end if;

  delete from public.availability_slots s where s.participant_id = v_participant.id;
  insert into public.availability_slots(participant_id, meeting_id, slot_key, starts_at, ends_at)
    select v_participant.id, p_meeting_id, item->>'slot_key',
      (item->>'starts_at')::timestamptz, (item->>'ends_at')::timestamptz
    from jsonb_array_elements(p_slots) item;
  return query select v_participant.id, v_participant.updated_at, v_created;
end;
$$;

revoke all on function public.save_participant_availability_atomic(uuid,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.save_participant_availability_atomic(uuid,text,text,timestamptz,jsonb) to service_role;
