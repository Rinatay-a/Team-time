import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ошибки реального Edge API', () => {
  afterEach(() => vi.restoreAllMocks());
  it('сохраняет код конфликта и русский текст из HTTP 409', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test_only');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Ответ уже изменён в другой вкладке', code: 'conflict' }), { status: 409 }));
    vi.resetModules();
    const real = await import('../src/services/api');
    try {
      await expect(real.api.saveAvailability('real-id', 'Анна', [])).rejects.toMatchObject({ code: 'conflict', message: 'Ответ уже изменён в другой вкладке' });
    } finally { vi.unstubAllEnvs(); }
  });
});
