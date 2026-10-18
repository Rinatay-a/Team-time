// Management metadata only. Do not print the response body or token.
const ref = process.env.SUPABASE_PROJECT_REF || '';
if (!/^[a-z]{20}$/.test(ref) || !process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error('Не заданы SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN.');
}
try {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Не удалось проверить публикацию функции: Management API HTTP ${response.status}.`);
  const functions = await response.json();
  const api = Array.isArray(functions) && functions.find((entry) => entry.slug === 'team-time-api' || entry.name === 'team-time-api');
  if (!api || api.status !== 'ACTIVE' || api.verify_jwt !== false) {
    throw new Error('Проверка не подтвердила ACTIVE team-time-api с verify_jwt=false. Проверьте Edge Functions в Dashboard.');
  }
  console.log('Проверено: team-time-api опубликована, ACTIVE, verify_jwt=false.');
} catch (error) {
  // Only our own fixed messages, never a fetch error containing an address.
  console.error(error.message.startsWith('Не удалось проверить') || error.message.startsWith('Проверка не подтвердила')
    ? error.message : 'Не удалось получить метаданные Edge Function. Проверьте Dashboard → Edge Functions.');
  process.exitCode = 1;
}
