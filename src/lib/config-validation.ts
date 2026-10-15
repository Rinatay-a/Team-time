// VITE_* values are embedded in the public JavaScript bundle.
export function publicConfigError(env: Record<string, string | undefined>): string | undefined {
  try {
    const url = new URL(env.VITE_SUPABASE_URL || '');
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.hostname.includes('your_project')) {
      return 'VITE_SUPABASE_URL: укажите HTTPS Project URL из Supabase (https://<project-ref>.supabase.co).';
    }
  } catch {
    return 'VITE_SUPABASE_URL: укажите Project URL из Supabase.';
  }
  const key = env.VITE_SUPABASE_ANON_KEY || '';
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  // Legacy anon keys are JWTs. Never accept service_role or secret keys here.
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    if (key.split('.').length === 3 && payload.role === 'anon') return;
  } catch { /* Invalid or non-public key. */ }
  return 'VITE_SUPABASE_ANON_KEY: разрешён только публичный Publishable key (sb_publishable_…) или legacy anon key. Секретные ключи запрещены.';
}
