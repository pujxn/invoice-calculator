import { defineConfig } from '@playwright/test';

// UI tests run against a throwaway API (:4100, console SMS) and the Vite dev server (:5273),
// so they do not clash with `npm run dev`. The API log is written to e2e/.server.log
// so tests can read the one-time codes the console provider prints.
const API_PORT = 4100;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 390, height: 560 },
    deviceScaleFactor: 2,
    trace: 'off',
  },
  webServer: [
    {
      command: 'node server/src/index.js > e2e/.server.log 2>&1',
      env: { PORT: String(API_PORT), SMS_PROVIDER: 'console', AUTH_SECRET: 'e2e-secret' },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -w client -- --port ${WEB_PORT} --strictPort`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
