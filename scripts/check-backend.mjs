import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
let legacyRole;
try { legacyRole = JSON.parse(Buffer.from((key || '').split('.')[1], 'base64url').toString()).role; } catch { /* Not a legacy JWT. */ }
if (!url || !key || (!key.startsWith('sb_publishable_') && legacyRole !== 'anon')) {
  throw new Error('Задайте только публичные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local. Секретные ключи запрещены.');
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const functionName = env.VITE_API_FUNCTION || 'team-time-api';

for (const table of ['meetings', 'meeting_dates', 'participants', 'availability_slots', 'meeting_invitees', 'api_rate_limits']) {
  const { error } = await client.from(table).select('*').limit(1);
  if (!error || error.code !== '42501') throw new Error(`${table}: ожидался запрет прямого доступа (42501). Проверьте миграции и ключ. ${error?.message || ''}`);
  console.log(`OK: анонимный доступ к ${table} запрещён`);
}
// A deliberate missing poll checks the application error response rather than
// a gateway JWT/deployment failure. No real poll or personal data is read.
const { error } = await client.functions.invoke(functionName, { body: { action: 'public_meeting', meetingId: '00000000-0000-0000-0000-000000000000' } });
let failure;
if (error?.context instanceof Response) {
  try { failure = await error.context.json(); } catch { /* Report below. */ }
}
if (failure?.error !== 'Опрос не найден') throw new Error(`Edge Function недоступна или настроена неверно: ${failure?.error || error?.message || 'неожиданный ответ'}`);
console.log('OK: team-time-api доступна участникам без регистрации');

const admin = await client.functions.invoke(functionName, { body: { action: 'admin_list' } });
let adminFailure;
if (admin.error?.context instanceof Response) {
  try { adminFailure = await admin.error.context.json(); } catch { /* Report below. */ }
}
if (!['Сессия истекла', 'Требуется вход организатора', 'Требуется учётная запись организатора'].includes(adminFailure?.error)) {
  throw new Error('Админский API не подтвердил запрет доступа без входа.');
}
console.log('OK: административный API требует входа');
console.log('Проверка подключения завершена. Создание и редактирование проверьте по DEPLOYMENT.md.');
