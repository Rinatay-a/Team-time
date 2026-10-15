import { spawnSync } from 'node:child_process';

// Deliberately fake public values, used only for local/CI browser tests.
// Deployment builds in a separate job with the real repository variables.
const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://pages-check.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_pages_check',
  VITE_API_FUNCTION: 'team-time-api',
  VITE_BASE_PATH: '/Team-time/',
  VITE_DEMO_MODE: 'false',
};
for (const args of [['run', 'build'], ['exec', 'playwright', 'test', '--', '--config=playwright.pages.config.ts']]) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
