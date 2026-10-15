import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { publicConfigError } from './src/lib/config-validation';
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build') {
    if (env.VITE_DEMO_MODE === 'true') throw new Error('Публикация деморежима запрещена: задайте VITE_DEMO_MODE=false. Для демо используйте npm run dev.');
    const error = publicConfigError(env);
    if (error) throw new Error(error);
  }
  return {
  plugins: [react(), tailwindcss()],
  base: env.VITE_BASE_PATH || (mode === 'production' ? '/Team-time/' : '/'),
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  test: { environment: 'jsdom', globals: true, include: ['tests/**/*.{test,spec}.{ts,tsx}'] }
  };
});
