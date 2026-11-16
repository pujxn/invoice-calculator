import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SERVER_LOG = fileURLToPath(new URL('./.server.log', import.meta.url));
const SCREENSHOT_DIR = fileURLToPath(new URL('../test-screenshots/', import.meta.url));

// A fresh number per test keeps the per-number rate limits from interfering.
export function uniquePhone() {
  return `+4477009${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
}

// Reads the latest code the console SMS provider printed for this number.
export async function latestCode(phone) {
  let code;
  await expect(async () => {
    const lines = readFileSync(SERVER_LOG, 'utf8')
      .split('\n')
      .filter((l) => l.includes(phone));
    code = /code is (\d{6})/.exec(lines.at(-1) ?? '')?.[1];
    expect(code).toBeTruthy();
  }).toPass({ timeout: 5000 });
  return code;
}

// Saves a screenshot for the PR only when SCREENSHOTS=1 (npm run test:ui:screens),
// in a folder named after the device project (phone, small-phone, desktop).
export async function shot(page, name) {
  if (!process.env.SCREENSHOTS) return;
  const device = test.info().project.name;
  await page.screenshot({ path: `${SCREENSHOT_DIR}${device}/${name}.png` });
}

export async function requestCodeFor(page, phone) {
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
}
