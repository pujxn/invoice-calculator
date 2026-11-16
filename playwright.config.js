import { tmpdir } from 'node:os';
import path from 'node:path';
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
    deviceScaleFactor: 2,
    trace: 'off',
  },
  // Every spec runs on a phone, a small phone and a desktop window. The phone projects
  // emulate touch, so tests can use tap() like a real finger.
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'small-phone',
      use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  ],
  webServer: [
    {
      command: 'node server/src/index.js > e2e/.server.log 2>&1',
      env: {
        PORT: String(API_PORT),
        SMS_PROVIDER: 'console',
        AUTH_SECRET: 'e2e-secret',
        // Pictures uploaded by the tests go to a throwaway folder, not server/uploads.
        UPLOAD_DIR: path.join(tmpdir(), 'invoice-calculator-e2e-uploads'),
        // The three device projects share one IP, so lift the per-IP caps (per-number limits stay on).
        AUTH_IP_REQUEST_LIMIT: '1000',
        AUTH_IP_VERIFY_LIMIT: '1000',
      },
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
