import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { SUPERADMINS } from './e2e/superadmins.js';

// UI tests run against a throwaway API (:4100, console SMS) and the Vite dev server (:5273),
// so they do not clash with `npm run dev`. The API log is written to e2e/.server.log
// so tests can read the one-time codes the console provider prints.
const API_PORT = 4100;
const WEB_PORT = 5273;
// A second pair for the local-OCR specs (ocr.spec.js): the same app, but the API really reads
// pictures with the free OCR and has no AI key, so "AI unavailable" is the true state.
const OCR_API_PORT = 4101;
const OCR_WEB_PORT = 5274;

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
      testIgnore: /ocr\.spec\.js/,
      use: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'small-phone',
      testIgnore: /ocr\.spec\.js/,
      use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop',
      testIgnore: /ocr\.spec\.js/,
      use: { viewport: { width: 1280, height: 720 } },
    },
    // Local-OCR specs only, on the same three screen sizes. Project names start with "ocr" (the
    // helpers then read that API's log).
    ...[
      ['ocr-phone', { width: 390, height: 664 }, true],
      ['ocr-small-phone', { width: 320, height: 568 }, true],
      ['ocr-desktop', { width: 1280, height: 720 }, false],
    ].map(([name, viewport, touch]) => ({
      name,
      testMatch: /ocr\.spec\.js/,
      timeout: 90_000,
      use: {
        baseURL: `http://localhost:${OCR_WEB_PORT}`,
        viewport,
        isMobile: touch,
        hasTouch: touch,
      },
    })),
  ],
  webServer: [
    {
      command: 'node server/src/index.js > e2e/.server.log 2>&1',
      env: {
        PORT: String(API_PORT),
        SMS_PROVIDER: 'console',
        // Tests never call the real AI, even if a key is set in server/.env or the shell.
        VISION_PROVIDER: 'mock',
        AUTH_SECRET: 'e2e-secret',
        SUPERADMIN_PHONES: SUPERADMINS.join(','),
        // A throwaway file for the agents and lists the tests add.
        DATA_FILE: path.join(tmpdir(), `invoice-calculator-e2e-data-${process.pid}.json`),
        // Lets native-api.spec.js call the API from the web page's own origin, as the apps do.
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
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
    {
      command: 'node server/src/index.js > e2e/.server-ocr.log 2>&1',
      env: {
        PORT: String(OCR_API_PORT),
        SMS_PROVIDER: 'console',
        VISION_PROVIDER: 'ocr',
        ANTHROPIC_API_KEY: '', // never call the real AI, and show it as "not set up"
        AUTH_SECRET: 'e2e-secret',
        SUPERADMIN_PHONES: SUPERADMINS.join(','),
        // A throwaway file for the agents and lists the tests add.
        DATA_FILE: path.join(tmpdir(), `invoice-calculator-e2e-data-ocr-${process.pid}.json`),
        UPLOAD_DIR: path.join(tmpdir(), 'invoice-calculator-e2e-uploads-ocr'),
        AUTH_IP_REQUEST_LIMIT: '1000',
        AUTH_IP_VERIFY_LIMIT: '1000',
      },
      url: `http://localhost:${OCR_API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -w client -- --port ${OCR_WEB_PORT} --strictPort`,
      env: { API_URL: `http://localhost:${OCR_API_PORT}` },
      url: `http://localhost:${OCR_WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
