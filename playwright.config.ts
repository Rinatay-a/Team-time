import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'pages.spec.ts',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    env: { VITE_DEMO_MODE: 'true' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
