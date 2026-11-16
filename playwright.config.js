import { defineConfig, devices } from '@playwright/test';

// UI tests run against the Vite dev server. API calls are mocked in the tests,
// so the Node server is not needed. In CI install the browser first:
//   npx playwright install --with-deps chromium
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -w client',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
