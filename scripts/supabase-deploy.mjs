import { spawnSync } from 'node:child_process';
import { resolve4 } from 'node:dns/promises';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

export const versions = ['001', '002', '003'];
export const tables = ['api_rate_limits', 'availability_slots', 'meeting_dates', 'meeting_invitees', 'meetings', 'participants'];

// Metadata only: no participant names, answers or credentials are selected.
export const inventorySql = `select json_build_object(
  'tables', coalesce((select json_agg(c.relname order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')), '[]'::json),
  'rlsTables', coalesce((select json_agg(c.relname order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relrowsecurity and c.relkind in ('r','p')), '[]'::json),
  'historyExists', to_regclass('supabase_migrations.schema_migrations') is not null,
  'pollType', exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='meetings' and column_name='poll_type'),
  'teamTypes', (select count(*)::int from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname in ('meeting_status','results_visibility','poll_type')),
  'snapshots', (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_participant_snapshot','get_meeting_participants_snapshot')),
  'atomicSave', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_participant_availability_atomic'),
  'productionSave', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_participant_availability_atomic'
      and p.prosrc like '%pg_advisory_xact_lock%' and p.prosrc like '%s.participant_id%')
)`;
const historySql = "select coalesce(json_agg(version order by version), '[]'::json) from supabase_migrations.schema_migrations";

export function migrationPlan(state, applied) {
  if (!Array.isArray(applied) || applied.length > versions.length || applied.some((v, i) => v !== versions[i])) {
    throw new Error('История миграций не является последовательностью 001 → 002 → 003. Остановлено без изменения БД; нужна сверка истории.');
  }
  if (!applied.length) {
    if (state.tables.length || state.teamTypes || state.atomicSave || state.snapshots) {
      throw new Error('В базе уже есть объекты, но история 001/002/003 пуста. SQL мог быть применён вручную. Не запускаем 001 и не исправляем историю автоматически; см. DEPLOYMENT.md.');
    }
  } else {
    if (tables.some((table) => !state.tables.includes(table) || !state.rlsTables.includes(table))) {
      throw new Error('История есть, но отсутствуют ожидаемые таблицы или RLS. Миграции остановлены для проверки схемы.');
    }
    if (state.pollType !== (applied.length >= 2)
      || state.atomicSave !== (applied.length >= 2)
      || state.snapshots !== (applied.length >= 2 ? 2 : 0)
      || state.teamTypes !== (applied.length >= 2 ? 3 : 2)
      || state.productionSave !== (applied.length === 3)) {
      throw new Error('Схема не соответствует записанным миграциям. Остановлено без повторного применения SQL; см. DEPLOYMENT.md.');
    }
  }
  return versions.slice(applied.length);
}

export function sessionConnection(raw, ref, password) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Неверный формат SUPABASE_DB_URL или адреса pooler. Значение скрыто.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !/^[a-z0-9-]+\.pooler\.supabase\.(com|co)$/.test(parsed.hostname)
    || parsed.port !== '5432' || parsed.pathname !== '/postgres'
    || parsed.hash || [...parsed.searchParams.keys()].some((key) => key !== 'sslmode')) {
    throw new Error('Нужен Supabase Session Pooler: host *.pooler.supabase.com, порт 5432, база postgres. Direct connection и Transaction Pooler 6543 запрещены.');
  }
  let user, pass;
  try { user = decodeURIComponent(parsed.username); pass = decodeURIComponent(parsed.password) || password; }
  catch { throw new Error('Некорректное URL-кодирование реквизитов подключения. Значение скрыто.'); }
  if (user !== `postgres.${ref}`) throw new Error('Пользователь pooler должен быть postgres.SUPABASE_PROJECT_REF. Проверьте выбранный проект.');
  if (!pass || pass.includes('[YOUR-PASSWORD]')) throw new Error('Не задан пароль БД: заполните SUPABASE_DB_PASSWORD или пароль в Secret SUPABASE_DB_URL.');
  const url = new URL(`postgresql://${parsed.hostname}:5432/postgres`);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(pass);
  url.searchParams.set('sslmode', 'require');
  return { url: url.href, host: parsed.hostname, user, password: pass };
}

export async function discoverConnection(env, fetcher = fetch, log = console.log) {
  const ref = env.SUPABASE_PROJECT_REF || '';
  if (!/^[a-z]{20}$/.test(ref)) throw new Error('Укажите корректную Variable SUPABASE_PROJECT_REF (Reference ID).');
  if (env.SUPABASE_DB_URL) return sessionConnection(env.SUPABASE_DB_URL, ref, env.SUPABASE_DB_PASSWORD);
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('Не задан Secret SUPABASE_ACCESS_TOKEN.');
  let response;
  try {
    response = await fetcher(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error('Не удалось получить настройки pooler через Management API. Можно задать Secret SUPABASE_DB_URL; см. DEPLOYMENT.md.'); }
  log(`Pooler Management API: HTTP ${response.status} (тело ответа скрыто).`);
  if (!response.ok) {
    const reason = [401, 403].includes(response.status)
      ? 'Токен не имеет доступа к настройкам pooler (database:read / database_pooling_config_read) или к проекту.'
      : 'Management API не вернул настройки pooler.';
    throw new Error(`${reason} Задайте Secret SUPABASE_DB_URL для Session Pooler 5432; расширять права токена для БД не требуется.`);
  }
  let configs;
  try { configs = await response.json(); } catch { throw new Error('Некорректный ответ pooler API. Значение скрыто.'); }
  const primary = Array.isArray(configs) && configs.find((entry) => entry.database_type === 'PRIMARY');
  if (!primary) throw new Error('Pooler API не вернул PRIMARY. Задайте Secret SUPABASE_DB_URL из Connect → Session pooler.');
  // Use the official host from the API, but always the SESSION port. We never
  // connect to the API's transaction port and do not guess a region/cluster.
  let host = primary.db_host;
  if (!host) {
    try { host = new URL(primary.connection_string).hostname; } catch { /* Validate below. */ }
  }
  return sessionConnection(`postgresql://postgres.${ref}@${host}:5432/postgres`, ref, env.SUPABASE_DB_PASSWORD);
}

export function redact(value, secrets = []) {
  let result = stripVTControlCharacters(String(value))
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[DATABASE_URL HIDDEN]')
    .replace(/sbp_[a-z0-9_]+/gi, '[TOKEN HIDDEN]');
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[HIDDEN]');
  return result;
}

export async function inspectDatabase(connection, ipv4, run) {
  const env = {
    ...process.env, PGHOST: connection.host, PGHOSTADDR: ipv4, PGPORT: '5432', PGUSER: connection.user,
    PGPASSWORD: connection.password, PGDATABASE: 'postgres', PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
    PGOPTIONS: '',
  };
  // Session poolers need not accept libpq's startup "options" parameter.
  // Enforce read-only transactions with SQL after connecting instead.
  const query = (sql) => run('psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
    `begin read only; set local statement_timeout='30s'; ${sql}; commit;`], env);
  const state = JSON.parse(await query(inventorySql));
  const applied = state.historyExists ? JSON.parse(await query(historySql)) : [];
  return { state, applied, pending: migrationPlan(state, applied) };
}

export async function deployDatabase(mode, env = process.env, deps = {}) {
  if (!['inspect-database', 'migrations-and-function'].includes(mode)) throw new Error('Неизвестная операция БД.');
  const log = deps.log || console.log;
  const connection = await discoverConnection(env, deps.fetcher, log);
  const secrets = [env.SUPABASE_ACCESS_TOKEN, env.SUPABASE_DB_URL, env.SUPABASE_DB_PASSWORD, connection.url, connection.password, encodeURIComponent(connection.password)];
  // Mask derived/encoded forms before invoking either CLI. Never print argv.
  if (env.GITHUB_ACTIONS === 'true') for (const secret of secrets.filter(Boolean)) {
    console.log(`::add-mask::${secret.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  }
  const run = deps.run || (async (command, args, commandEnv = env) => {
    const result = spawnSync(command, args, { env: commandEnv, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      const detail = redact(result.stderr || result.error?.code || 'command failed', secrets).slice(-4000);
      throw new Error(`${command} завершился с ошибкой. ${detail}`);
    }
    return result.stdout.trim();
  });
  const addresses = await (deps.resolve4 || resolve4)(connection.host).catch(() => []);
  if (!addresses.length) throw new Error('Session Pooler не имеет доступного IPv4 A-адреса. Проверьте host из Connect → Session pooler.');
  log('Подключение: Session Pooler, IPv4, порт 5432, TLS. Реквизиты скрыты.');
  let inventory = await inspectDatabase(connection, addresses[0], run);
  const report = ({ applied, pending }) => {
    log(`Применено: ${applied.join(', ') || 'нет'}. Ожидает: ${pending.join(', ') || 'нет'}.`);
    if (env.GITHUB_STEP_SUMMARY && !deps.run) appendFileSync(env.GITHUB_STEP_SUMMARY,
      `### База данных\nSession Pooler · IPv4 · 5432 · TLS\n\nПрименено: ${applied.join(', ') || 'нет'}\n\nОжидает: ${pending.join(', ') || 'нет'}\n\n`);
  };
  report(inventory);
  if (mode === 'inspect-database') {
    log('Диагностика завершена. SQL-миграции не запускались, данные не изменялись.');
    return inventory;
  }
  // List and dry-run use the same explicit URL as the actual push. Never rely
  // on .temp/project-ref or the best-effort pooler cache from `supabase link`.
  await run('supabase', ['migration', 'list', '--db-url', connection.url]);
  await run('supabase', ['db', 'push', '--db-url', connection.url, '--skip-vault', '--dry-run']);
  // Recheck schema/history after dry-run before any write.
  const latest = await inspectDatabase(connection, addresses[0], run);
  if (JSON.stringify(latest.applied) !== JSON.stringify(inventory.applied)) throw new Error('История изменилась во время проверки. Остановлено; запустите новую диагностику.');
  if (latest.pending.length) await run('supabase', ['db', 'push', '--db-url', connection.url, '--skip-vault', '--yes']);
  inventory = await inspectDatabase(connection, addresses[0], run);
  if (inventory.pending.length) throw new Error('Не все миграции применены. Функция не будет опубликована.');
  report(inventory);
  log(`Проверено: все ${tables.length} таблиц существуют с RLS, миграции 001/002/003 применены, серверные RPC доступны в схеме.`);
  return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployDatabase(process.argv[2]).catch((error) => {
    // No raw fetch error, URL, CLI argv or stack is ever emitted.
    console.error(redact(error.message, [process.env.SUPABASE_ACCESS_TOKEN, process.env.SUPABASE_DB_PASSWORD, process.env.SUPABASE_DB_URL]));
    process.exitCode = 1;
  });
}
