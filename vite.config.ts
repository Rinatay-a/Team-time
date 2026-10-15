import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || (mode === 'production' ? '/team-time/' : '/'),
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  test: { environment: 'jsdom', globals: true, include: ['tests/**/*.{test,spec}.{ts,tsx}'] }
}));
