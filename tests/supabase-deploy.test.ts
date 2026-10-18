// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error The Node CI helper is intentionally plain JavaScript.
import { deployDatabase, discoverConnection, inventorySql, migrationPlan, redact, sessionConnection, tables } from '../scripts/supabase-deploy.mjs';

const ref = 'abcdefghijklmnopqrst';
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const url = `postgresql://postgres.${ref}@${host}:5432/postgres`;
const env = { SUPABASE_PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: 'private-token', SUPABASE_DB_PASSWORD: 'p@:/?#% &', SUPABASE_DB_URL: url };
const empty = { tables: [], rlsTables: [], historyExists: false, teamTypes: 0, pollType: false, snapshots: 0, atomicSave: false, productionSave: false };
const complete = { tables, rlsTables: tables, historyExists: true, teamTypes: 3, pollType: true, snapshots: 2, atomicSave: true, productionSave: true };

describe('подключение только к Session Pooler', () => {
  it('передаёт спецсимволы пароля без потерь и требует TLS', () => {
    const parsed = new URL(sessionConnection(url, ref, env.SUPABASE_DB_PASSWORD).url);
    expect(decodeURIComponent(parsed.password)).toBe(env.SUPABASE_DB_PASSWORD);
    expect(parsed.searchParams.get('sslmode')).toBe('require');
  });
  it('запрещает 6543, прямой адрес, чужой проект и параметры переопределения', () => {
    for (const invalid of [url.replace('5432', '6543'), url.replace(host, `db.${ref}.supabase.co`), url.replace(ref, 'z'.repeat(20)), `${url}?host=evil.example`, url.replace('5432', '443')]) {
      expect(() => sessionConnection(invalid, ref, 'secret')).toThrow();
    }
  });
  it('явный Secret обходит pooler API, не требуя расширять права токена', async () => {
    const fetcher = vi.fn();
    expect((await discoverConnection(env, fetcher)).host).toBe(host);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('получает официальный host и всегда выбирает session 5432', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ database_type: 'PRIMARY', db_host: host, db_port: 6543, pool_mode: 'transaction' }])));
    const connection = await discoverConnection({ ...env, SUPABASE_DB_URL: '' }, fetcher, () => undefined);
    expect(new URL(connection.url).port).toBe('5432');
    expect(fetcher).toHaveBeenCalledWith(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, expect.anything());
  });
  it('сообщает точный HTTP 403, не печатая тело ответа', async () => {
    const log = vi.fn();
    await expect(discoverConnection({ ...env, SUPABASE_DB_URL: '' }, async () => new Response('PRIVATE BODY', { status: 403 }), log)).rejects.toThrow('database:read');
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE BODY');
    expect(JSON.stringify(log.mock.calls)).toContain('HTTP 403');
  });
  it('скрывает URL, raw/encoded пароль и токен из ошибок CLI', () => {
    const input = `postgresql://user:anotherpassword@${host}/postgres private-token ${env.SUPABASE_DB_PASSWORD} ${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}`;
    const output = redact(input, ['private-token', env.SUPABASE_DB_PASSWORD, encodeURIComponent(env.SUPABASE_DB_PASSWORD)]);
    expect(output).not.toContain('anotherpassword');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain(env.SUPABASE_DB_PASSWORD);
    expect(output).not.toContain(encodeURIComponent(env.SUPABASE_DB_PASSWORD));
  });
});

describe('проверка до применения миграций', () => {
  it('планирует все три только для пустой базы и ничего для полностью обновлённой', () => {
    expect(migrationPlan(empty, [])).toEqual(['001', '002', '003']);
    expect(migrationPlan(complete, ['001', '002', '003'])).toEqual([]);
    expect(migrationPlan({ ...complete, productionSave: false }, ['001', '002'])).toEqual(['003']);
  });
  it('останавливается при ручной схеме без истории, пропусках, неизвестных версиях и drift', () => {
    for (const [state, applied] of [[complete, []], [empty, ['002']], [complete, ['001', '002', '003', '004']], [empty, ['001']], [{ ...complete, productionSave: false }, ['001', '002', '003']]]) {
      expect(() => migrationPlan(state, applied)).toThrow();
    }
  });
  const harness = (initialState = empty, initialVersions: string[] = []) => {
    let state = initialState;
    let applied = initialVersions;
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'psql') return JSON.stringify(args.at(-1)?.includes(inventorySql) ? state : applied);
      if (args.includes('--yes')) { state = complete; applied = ['001', '002', '003']; }
      return '';
    });
    return { run, log: vi.fn(), resolve4: async () => ['192.0.2.1'] };
  };
  it('push-диагностика выполняет только read-only запросы по IPv4', async () => {
    const deps = harness();
    await deployDatabase('inspect-database', env, deps);
    expect(deps.run.mock.calls.every(([command]) => command === 'psql')).toBe(true);
    const commandEnv = (deps.run.mock.calls[0] as unknown[])[2] as Record<string, string>;
    expect(commandEnv.PGHOSTADDR).toBe('192.0.2.1');
    expect(commandEnv.PGPORT).toBe('5432');
    expect(deps.run.mock.calls[0][1].at(-1)).toContain('begin read only;');
  });
  it('проверяет историю до list/dry-run/push и проверяет результат', async () => {
    const deps = harness();
    const result = await deployDatabase('migrations-and-function', env, deps);
    expect(deps.run.mock.calls[0][0]).toBe('psql');
    const commands = deps.run.mock.calls.filter(([command]) => command === 'supabase').map(([, args]) => args);
    expect(commands).toHaveLength(3);
    expect(commands[0].slice(0, 2)).toEqual(['migration', 'list']);
    expect(commands[1]).toContain('--dry-run');
    expect(commands[2]).toContain('--yes');
    expect(commands.every((args) => args.includes('--db-url') && !args.includes('link'))).toBe(true);
    expect(result.applied).toEqual(['001', '002', '003']);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain(env.SUPABASE_DB_PASSWORD);
  });
  it('не вызывает push для полностью применённых миграций', async () => {
    const deps = harness(complete, ['001', '002', '003']);
    await deployDatabase('migrations-and-function', env, deps);
    expect(deps.run.mock.calls.some(([, args]) => args.includes('--yes'))).toBe(false);
  });
  it('не вызывает CLI при схеме без истории и при отсутствии IPv4', async () => {
    const deps = harness(complete);
    await expect(deployDatabase('migrations-and-function', env, deps)).rejects.toThrow('история');
    expect(deps.run.mock.calls.some(([command]) => command === 'supabase')).toBe(false);
    const unreachable = harness();
    unreachable.resolve4 = async () => [];
    await expect(deployDatabase('migrations-and-function', env, unreachable)).rejects.toThrow('IPv4');
    expect(unreachable.run).not.toHaveBeenCalled();
  });
});
