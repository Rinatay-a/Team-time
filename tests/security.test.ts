import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const initial = readFileSync('supabase/migrations/001_initial.sql', 'utf8');
const migration = readFileSync('supabase/migrations/002_poll_types_and_atomic_availability.sql', 'utf8');
const edge = readFileSync('supabase/functions/team-time-api/index.ts', 'utf8');

describe('миграция 2.0', () => {
  it('не изменяет 001 и добавляет тип с обратным default meeting', () => {
    expect(migration).toContain("default 'meeting'");
    expect(migration).toContain("alter column meeting_duration drop not null");
  });
  it('заменяет слоты атомарной SQL-функцией', () => {
    expect(migration).toContain('save_participant_availability_atomic');
    expect(migration).toContain('delete from public.availability_slots');
    expect(migration).toContain('insert into public.availability_slots');
    expect(migration).toContain('grant execute');
  });
  it('сохраняет RLS и запрет прямого anon-доступа', () => {
    for (const table of ['meetings', 'participants', 'availability_slots']) expect(initial).toContain(`alter table public.${table} enable row level security`);
    expect(initial).toContain('revoke all on all tables in schema public from anon');
  });
});

describe('защищённый API', () => {
  it('проверяет JWT и владельца на админских действиях', () => {
    expect(edge).toContain('client.auth.getUser()');
    expect(edge).toContain('meeting.organizer_id !== user.id');
  });
  it('редактирует участника только по хешу токена', () => {
    expect(edge).toContain(".eq('edit_token_hash', await sha256(editToken))");
    expect(edge).not.toContain(".eq('display_name', displayName)");
  });
  it('не раскрывает участников при organizer visibility', () => {
    expect(edge).toContain("meeting.results_visibility === 'everyone'");
  });
  it('запрещает финализацию availability и проверяет сетку встречи', () => {
    expect(edge).toContain("meeting.poll_type !== 'meeting'");
    expect(edge).toContain('(startValue - gridStart) % meeting.slot_duration');
  });
  it('создаёт availability без длительности, а meeting с проверенной длительностью', () => {
    expect(edge).toContain("pollType === 'meeting' ? Number(input.meeting_duration) : null");
    expect(migration).toContain("poll_type = 'availability' and meeting_duration is null");
  });
  it('валидирует реальную дату, шаг и границы каждого слота', () => {
    expect(edge).toContain('validDate(date)');
    expect(edge).toContain('(value - start) % meeting.slot_duration');
    expect(edge).toContain('localToUtc(key, meeting.timezone)');
  });
});
