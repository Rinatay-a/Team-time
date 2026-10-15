// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const organizer = '00000000-0000-0000-0000-000000000001';
const outsider = '00000000-0000-0000-0000-000000000002';
let meeting: string;
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const row = (key: string) => ({ slot_key: key, starts_at: `${key}:00+03:00`, ends_at: `${key}:00+02:30` });
const save = (hash: string, slots: unknown[], expected: string | null = null, id = meeting) =>
  db.query<{ participant_id: string; version: string; created: boolean }>(
    `select participant_id, participant_updated_at::text as version, created
     from public.save_participant_availability_atomic($1, 'Анна', $2, $3, $4)`,
    [id, hash, expected, JSON.stringify(slots)],
  );

beforeAll(async () => {
  // Supabase owns auth.users/auth.uid and creates these roles. Reproduce them
  // in embedded PostgreSQL, without credentials or a remote project.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const file of ['001_initial.sql', '002_poll_types_and_atomic_availability.sql', '003_production_safety.sql']) {
    // pgcrypto is not shipped by PGlite. No SQL in this project uses it;
    // gen_random_uuid() is built into PostgreSQL. Production runs the full file.
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace('create extension if not exists pgcrypto;', ''));
  }
  await db.query('insert into auth.users(id) values ($1), ($2)', [organizer, outsider]);
  const result = await db.query<{ id: string }>(`insert into public.meetings
    (organizer_id,title,start_hour,end_hour,slot_duration,meeting_duration)
    values ($1,'Встреча','09:00','23:00',15,60) returning id`, [organizer]);
  meeting = result.rows[0].id;
}, 30_000);
afterAll(() => db.close());

describe('реальное выполнение миграций в PostgreSQL', () => {
  it('создаёт оба типа опроса и сохраняет default meeting', async () => {
    expect((await db.query<{ poll_type: string }>('select poll_type from meetings where id=$1', [meeting])).rows[0].poll_type).toBe('meeting');
    await db.query(`insert into meetings (organizer_id,title,poll_type,start_hour,end_hour,slot_duration,meeting_duration)
      values ($1,'Доступность','availability','09:00','23:00',15,null)`, [organizer]);
  });

  it('сохраняет и редактирует свой ответ, снимок не теряет слоты', async () => {
    const first = (await save(hashA, [row('2026-10-21T09:00')])).rows[0];
    expect(first.created).toBe(true);
    const second = (await save(hashA, [row('2026-10-21T10:00')], first.version)).rows[0];
    expect(second.participant_id).toBe(first.participant_id);
    const snapshot = (await db.query<{ data: { slots: string[] } }>('select get_participant_snapshot($1,$2) as data', [meeting, hashA])).rows[0].data;
    expect(snapshot.slots).toEqual(['2026-10-21T10:00']);
  });

  it('одинаковое имя с другим токеном создаёт отдельный ответ', async () => {
    await save(hashB, [row('2026-10-21T11:00')]);
    expect((await db.query('select id from participants where meeting_id=$1', [meeting])).rows).toHaveLength(2);
    const unknown = (await db.query<{ data: unknown }>('select get_participant_snapshot($1,$2) as data', [meeting, 'c'.repeat(64)])).rows[0].data;
    expect(unknown).toBeNull();
  });

  it('устаревшая версия отклоняется и не меняет ответ', async () => {
    const first = (await save(hashB, [row('2026-10-21T11:00')])).rows[0];
    await save(hashB, [row('2026-10-21T12:00')], first.version);
    await expect(save(hashB, [], first.version)).rejects.toThrow('availability_conflict');
    expect((await db.query<{ data: { slots: string[] } }>('select get_participant_snapshot($1,$2) as data', [meeting, hashB])).rows[0].data.slots).toEqual(['2026-10-21T12:00']);
  });

  it('ошибка вставки откатывает удаление слотов и обновление имени', async () => {
    await expect(save(hashB, [{ ...row('2026-10-21T13:00'), slot_key: 'invalid' }])).rejects.toThrow();
    expect((await db.query<{ data: { slots: string[] } }>('select get_participant_snapshot($1,$2) as data', [meeting, hashB])).rows[0].data.slots).toEqual(['2026-10-21T12:00']);
  });

  it('возвращает все 2352 слота в личном и общем снимках', async () => {
    const slots = Array.from({ length: 2352 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 19 + Math.floor(i / 56))).toISOString().slice(0, 10);
      const minutes = 540 + (i % 56) * 15;
      return row(`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    });
    await save(hashA, slots);
    const own = (await db.query<{ data: { slots: string[] } }>('select get_participant_snapshot($1,$2) as data', [meeting, hashA])).rows[0].data;
    expect(own.slots).toHaveLength(2352);
    const all = (await db.query<{ data: { slots: string[] }[] }>('select get_meeting_participants_snapshot($1) as data', [meeting])).rows[0].data;
    expect(all.some((p) => p.slots.length === 2352)).toBe(true);
  });

  it('anon не читает таблицы и не вызывает серверные SQL-функции', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from participants')).rejects.toThrow('permission denied');
      await expect(db.query('select * from meetings')).rejects.toThrow('permission denied');
      await expect(db.query('select get_meeting_participants_snapshot($1)', [meeting])).rejects.toThrow('permission denied');
      await expect(save(hashA, [])).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); }
  });

  it('другой организатор не читает и не изменяет чужие ответы через RLS', async () => {
    await db.exec('set role authenticated');
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [outsider]);
      expect((await db.query('select * from meetings')).rows).toEqual([]);
      expect((await db.query('select * from participants')).rows).toEqual([]);
      expect((await db.query("update participants set display_name='Чужой' returning id")).rows).toEqual([]);
      await expect(save(hashA, [])).rejects.toThrow('permission denied');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [organizer]);
      expect((await db.query('select * from participants')).rows).toHaveLength(2);
    } finally { await db.exec('reset role'); }
  });

  it('проверяет закрытие опроса внутри транзакции сохранения', async () => {
    await db.query("update meetings set status='closed' where id=$1", [meeting]);
    await expect(save(hashA, [])).rejects.toThrow('Сбор ответов закрыт');
  });
  it('серверная роль может сохранить и прочитать ответ через закрытые RPC', async () => {
    await db.query("update meetings set status='collecting' where id=$1", [meeting]);
    await db.exec('set role service_role');
    try {
      expect((await save(hashA, [row('2026-10-21T09:00')])).rows).toHaveLength(1);
      const data = await db.query<{ data: { slots: string[] } }>('select get_participant_snapshot($1,$2) as data', [meeting, hashA]);
      expect(data.rows[0].data.slots).toEqual(['2026-10-21T09:00']);
    } finally { await db.exec('reset role'); }
  });
});
