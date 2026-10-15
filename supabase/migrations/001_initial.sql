-- «Время команды»: схема, ограничения и RLS
create extension if not exists pgcrypto;
create type public.meeting_status as enum ('collecting','finalized','closed','archived');
create type public.results_visibility as enum ('organizer','everyone');

create table public.meetings (
 id uuid primary key default gen_random_uuid(), organizer_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 120), description text not null default '' check (char_length(description)<=2000),
 organizer_name text check (char_length(organizer_name)<=120), timezone text not null default 'Europe/Moscow' check (char_length(timezone)<=64),
 start_hour time not null, end_hour time not null, slot_duration smallint not null check(slot_duration in(15,30)),
 meeting_duration smallint not null check(meeting_duration between 15 and 720 and meeting_duration%slot_duration=0),
 results_visibility public.results_visibility not null default 'organizer', status public.meeting_status not null default 'collecting',
 finalized_start timestamptz, finalized_end timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(start_hour<end_hour), check((finalized_start is null and finalized_end is null) or finalized_start<finalized_end)
);
create table public.meeting_dates(id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.meetings(id) on delete cascade,date date not null,unique(meeting_id,date));
create table public.participants(id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.meetings(id) on delete cascade,display_name text not null check(char_length(display_name) between 1 and 100),edit_token_hash text not null check(char_length(edit_token_hash)=64),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index participants_token_per_meeting on public.participants(meeting_id,edit_token_hash);
create index participants_meeting_idx on public.participants(meeting_id);
create table public.availability_slots(id bigint generated always as identity primary key,participant_id uuid not null references public.participants(id) on delete cascade,meeting_id uuid not null references public.meetings(id) on delete cascade,slot_key text not null check(slot_key ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),starts_at timestamptz not null,ends_at timestamptz not null,check(starts_at<ends_at),unique(participant_id,slot_key));
create index availability_meeting_start_idx on public.availability_slots(meeting_id,starts_at);
create table public.meeting_invitees(id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.meetings(id) on delete cascade,display_name text not null check(char_length(display_name) between 1 and 100),participant_id uuid references public.participants(id) on delete set null);
create index invitees_meeting_idx on public.meeting_invitees(meeting_id);
create table public.api_rate_limits(key_hash text primary key,window_start timestamptz not null default now(),request_count integer not null default 1);

alter table public.meetings enable row level security;alter table public.meeting_dates enable row level security;alter table public.participants enable row level security;alter table public.availability_slots enable row level security;alter table public.meeting_invitees enable row level security;alter table public.api_rate_limits enable row level security;
-- Анонимным клиентам не назначаются политики: прямой доступ полностью запрещён.
create policy "organizer owns meetings" on public.meetings for all to authenticated using(organizer_id=auth.uid()) with check(organizer_id=auth.uid());
create policy "organizer reads dates" on public.meeting_dates for select to authenticated using(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid()));
create policy "organizer changes dates" on public.meeting_dates for all to authenticated using(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid())) with check(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid()));
create policy "organizer participants" on public.participants for all to authenticated using(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid())) with check(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid()));
create policy "organizer slots" on public.availability_slots for all to authenticated using(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid())) with check(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid()));
create policy "organizer invitees" on public.meeting_invitees for all to authenticated using(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid())) with check(exists(select 1 from public.meetings m where m.id=meeting_id and m.organizer_id=auth.uid()));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();
create trigger participants_touch before update on public.participants for each row execute function public.touch_updated_at();
revoke all on all tables in schema public from anon;revoke all on all sequences in schema public from anon;
-- authenticated получает только то, что дополнительно разрешит RLS
revoke all on public.api_rate_limits from authenticated;
