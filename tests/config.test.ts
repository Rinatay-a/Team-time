import { describe, expect, it } from 'vitest';
import { publicConfigError } from '../src/lib/config-validation';

describe('только публичная конфигурация', () => {
  const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_only' };
  it('принимает publishable и legacy anon', () => {
    expect(publicConfigError(env)).toBeUndefined();
    expect(publicConfigError({ ...env, VITE_SUPABASE_ANON_KEY: `eyJ.test.${btoa('signature')}`.replace('test', btoa(JSON.stringify({ role: 'anon' }))) })).toBeUndefined();
  });
  it('отклоняет незаполненную конфигурацию и шаблон', () => {
    expect(publicConfigError({})).toContain('VITE_SUPABASE_URL');
    expect(publicConfigError({ ...env, VITE_SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co' })).toContain('VITE_SUPABASE_URL');
    expect(publicConfigError({ ...env, VITE_SUPABASE_ANON_KEY: '' })).toContain('VITE_SUPABASE_ANON_KEY');
  });
  it('отклоняет оба вида секретных ключей', () => {
    expect(publicConfigError({ ...env, VITE_SUPABASE_ANON_KEY: 'sb_secret_private' })).toContain('Секретные ключи запрещены');
    const privileged = `eyJ.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(publicConfigError({ ...env, VITE_SUPABASE_ANON_KEY: privileged })).toContain('Секретные ключи запрещены');
  });
});
