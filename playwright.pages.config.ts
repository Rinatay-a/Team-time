import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pages.spec.ts',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4174/Team-time/', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/Team-time/',
    reuseExistingServer: false,
  },
  projects: [{ name: 'pages-chromium', use: { ...devices['Desktop Chrome'] } }],
});
