// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the production Deno HTTP handler with the Supabase network boundary
// replaced. SQL itself is exercised separately in database.test.ts.
const source = readFileSync('supabase/functions/team-time-api/index.ts', 'utf8').replace(/^import .*;\n/, '');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const baseMeeting = {
  id: '00000000-0000-0000-0000-000000000003', organizer_id: 'owner', title: 'Тест',
  poll_type: 'meeting', meeting_duration: 60, results_visibility: 'organizer', status: 'collecting',
  timezone: 'Europe/Moscow', start_hour: '09:00:00', end_hour: '12:00:00', slot_duration: 30,
  meeting_dates: [{ date: '2026-10-21' }], meeting_invitees: [{ count: 0 }],
};

function server(options: { user?: { id: string; is_anonymous?: boolean }; meeting?: Record<string, unknown>; knownToken?: boolean; mutationError?: boolean } = {}) {
  const meeting = { ...baseMeeting, ...options.meeting };
  const mutations: { table: string; operation: string; input: unknown }[] = [];
  const rpc = vi.fn(async (name: string, args?: unknown): Promise<{ data: any; error: Error | null }> => {
    void args;
    return {
    data: name === 'get_participant_snapshot' ? null : name === 'save_participant_availability_atomic'
      ? [{ participant_id: 'participant', participant_updated_at: '2026-10-15T12:00:00Z' }] : [],
    error: null,
    };
  });
  const db = {
    rpc,
    from: (table: string) => {
      let input: Record<string, unknown> = {};
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: (value: Record<string, unknown>) => { input = value; mutations.push({ table, operation: 'insert', input }); return builder; },
        update: (value: Record<string, unknown>) => { mutations.push({ table, operation: 'update', input: value }); return builder; },
        delete: () => { mutations.push({ table, operation: 'delete', input: null }); return builder; },
        upsert: () => builder,
        single: async () => ({ data: Object.keys(input).length ? { ...input, id: meeting.id } : { ...meeting }, error: null }),
        maybeSingle: async () => ({ data: table === 'participants' && options.knownToken ? { id: 'participant' } : null, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: options.mutationError && table !== 'api_rate_limits' ? new Error('Database write failed') : null }).then(resolve),
      };
      return builder;
    },
  };
  let handler!: (request: Request) => Promise<Response>;
  new Function('createClient', 'Deno', javascript)(
    (_url: string, key: string) => key === 'service' ? db : { auth: { getUser: async () => ({ data: { user: options.user || null } }) } },
    { env: { get: (name: string) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon' })[name] }, serve: (callback: typeof handler) => { handler = callback; } },
  );
  return {
    rpc, mutations,
    request: (action: string, body: Record<string, unknown> = {}, authorization?: string) => handler(new Request('https://example.supabase.co/functions/v1/team-time-api', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ action, meetingId: meeting.id, ...body }),
    })),
  };
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe('production HTTP API', () => {
  it('публичное чтение не требует входа и скрывает закрытые результаты', async () => {
    const app = server();
    const response = await app.request('public_meeting');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canViewResults).toBe(false);
    expect(body.participants).toBeUndefined();
    expect(body.meeting.organizer_id).toBeUndefined();
    expect(app.rpc).not.toHaveBeenCalled();
  });
  it('открытые результаты доступны без входа, личный ответ ищется по хешу', async () => {
    const app = server({ meeting: { results_visibility: 'everyone' } });
    expect((await app.request('public_meeting', { editToken: 'private-token' })).status).toBe(200);
    expect(app.rpc).toHaveBeenCalledWith('get_participant_snapshot', expect.objectContaining({ p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(app.rpc).toHaveBeenCalledWith('get_meeting_participants_snapshot', expect.anything());
  });
  it('отклоняет админские операции без JWT и чужого организатора', async () => {
    expect((await server().request('admin_list')).status).toBe(400);
    const foreign = server({ user: { id: 'outsider' } });
    expect((await foreign.request('admin_delete_meeting', {}, 'Bearer valid-other-user')).status).toBe(400);
    expect(foreign.mutations).toEqual([]);
  });
  it('анонимный Supabase Auth пользователь не становится организатором', async () => {
    const response = await server({ user: { id: 'owner', is_anonymous: true } }).request('admin_list', {}, 'Bearer anonymous');
    expect(response.status).toBe(400);
  });
  it('совпавшее имя и неверный токен не дают менять чужой ответ', async () => {
    const app = server();
    const response = await app.request('save_availability', { displayName: 'Анна', slots: [], editToken: 'wrong-token' });
    expect(response.status).toBe(400);
    expect(app.rpc).not.toHaveBeenCalled();
  });
  it('анонимно сохраняет ответ с 256-битным токеном и переводит слоты в UTC', async () => {
    const app = server();
    const response = await app.request('save_availability', { displayName: 'Анна', slots: ['2026-10-21T09:00'] });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.editToken).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.participant.slots).toEqual(['2026-10-21T09:00']);
    expect(app.rpc).toHaveBeenCalledWith('save_participant_availability_atomic', expect.objectContaining({
      p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_slots: [{ slot_key: '2026-10-21T09:00', starts_at: '2026-10-21T06:00:00.000Z', ends_at: '2026-10-21T06:30:00.000Z' }],
    }));
    expect(app.rpc.mock.calls[0][1]).not.toHaveProperty('p_token_hash', saved.editToken);
  });
  it('при редактировании использует токен владельца и возвращает HTTP 409 при конфликте', async () => {
    const app = server({ knownToken: true });
    const token = 'a'.repeat(64);
    const response = await app.request('save_availability', { displayName: 'Анна', slots: [], editToken: token, expectedUpdatedAt: '2026-10-15T12:00:00Z' });
    expect((await response.json()).editToken).toBe(token);
    expect(app.rpc).toHaveBeenCalledWith('save_participant_availability_atomic', expect.objectContaining({ p_expected_updated_at: '2026-10-15T12:00:00Z' }));
    app.rpc.mockResolvedValueOnce({ data: null, error: new Error('availability_conflict') });
    const conflict = await app.request('save_availability', { displayName: 'Анна', slots: [], editToken: token });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('conflict');
  });
  it('проверяет допустимые слоты до записи в БД', async () => {
    for (const slots of [['2026-10-22T09:00'], ['2026-10-21T09:15'], ['2026-10-21T12:00'], ['2026-10-21T09:00', '2026-10-21T09:00']]) {
      const app = server();
      expect((await app.request('save_availability', { displayName: 'Анна', slots })).status).toBe(400);
      expect(app.rpc).not.toHaveBeenCalled();
    }
  });
  it('закрытый опрос отклоняет сохранение', async () => {
    const app = server({ meeting: { status: 'closed' } });
    expect((await app.request('save_availability', { displayName: 'Анна', slots: [] })).status).toBe(400);
    expect(app.rpc).not.toHaveBeenCalled();
  });
  it('создаёт оба типа опроса от имени проверенного организатора', async () => {
    for (const poll_type of ['meeting', 'availability']) {
      const app = server({ user: { id: 'owner' } });
      const response = await app.request('admin_create', { input: {
        poll_type, title: 'Опрос', dates: ['2026-10-21'], start_hour: '09:00', end_hour: '12:00', slot_duration: 30, meeting_duration: 60,
      } }, 'Bearer valid');
      expect(response.status).toBe(200);
      expect(app.mutations[0].input).toMatchObject({ poll_type, organizer_id: 'owner', meeting_duration: poll_type === 'meeting' ? 60 : null });
    }
  });
  it('владелец может закрыть свой опрос, ошибка БД не выдаётся за успех', async () => {
    const app = server({ user: { id: 'owner' } });
    expect((await app.request('admin_close', {}, 'Bearer valid')).status).toBe(200);
    expect(app.mutations[0]).toMatchObject({ table: 'meetings', operation: 'update', input: { status: 'closed' } });
    const failed = server({ user: { id: 'owner' }, mutationError: true });
    expect((await failed.request('admin_close', {}, 'Bearer valid')).status).toBe(400);
  });
});
