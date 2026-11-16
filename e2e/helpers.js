import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SERVER_LOG = fileURLToPath(new URL('./.server.log', import.meta.url));
// Screenshots are for reviewing, not for the repo: they go to a git-ignored folder
// (or wherever SCREENSHOT_DIR points).
const SCREENSHOT_DIR = (
  process.env.SCREENSHOT_DIR || fileURLToPath(new URL('./.screenshots', import.meta.url))
).replace(/\/?$/, '/');

// A fresh number per sign-in keeps the per-number rate limits (one code per 30 seconds, five an
// hour) from interfering. Nine random digits plus a never-repeating counter, so two sign-ins can
// never get the same number (random five-digit numbers collided about once in 20 runs).
const usedPhones = new Set();
export function uniquePhone() {
  for (;;) {
    const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const phone = `+447${digits}`;
    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
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
  await page.screenshot({ path: `${SCREENSHOT_DIR}${device}/${name}.png`, fullPage: true });
}

export async function requestCodeFor(page, phone) {
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
}

// Signs in through the real login page with a fresh number and returns that number.
export async function signIn(page, phone = uniquePhone()) {
  await page.goto('/login');
  await requestCodeFor(page, phone);
  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
  return phone;
}

export async function expectNoSideScroll(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

const MIN_TAP = 44; // px; Apple asks for 44, Google for 48

export async function expectTouchFriendly(page) {
  for (const control of await page.locator('button:visible, input:visible').all()) {
    const box = await control.boundingBox();
    expect(box.height, await control.evaluate((el) => el.outerHTML)).toBeGreaterThanOrEqual(
      MIN_TAP,
    );
  }
  // 16px or larger stops iOS Safari from zooming the page when an input gets focus.
  for (const input of await page.locator('input:visible').all()) {
    const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  }
}
