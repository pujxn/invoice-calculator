import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { SUPERADMINS } from './superadmins.js';

const SERVER_LOG = fileURLToPath(new URL('./.server.log', import.meta.url));
// The local-OCR specs run against their own API (see playwright.config.js) with its own log.
const OCR_SERVER_LOG = fileURLToPath(new URL('./.server-ocr.log', import.meta.url));
// Screenshots are for reviewing, not for the repo: they go to a git-ignored folder
// (or wherever SCREENSHOT_DIR points).
const SCREENSHOT_DIR = (
  process.env.SCREENSHOT_DIR || fileURLToPath(new URL('../test-screenshots', import.meta.url))
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

// The API each project's pages talk to (see playwright.config.js).
const API_PORTS = { default: 4100, ocr: 4101 };
const apiBase = () =>
  `http://localhost:${test.info().project.name.startsWith('ocr') ? API_PORTS.ocr : API_PORTS.default}`;

async function apiCall(method, path, { token, body } = {}) {
  const res = await fetch(apiBase() + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Superadmin numbers are handed out once each per test process, starting at a random one so a
// restarted test process does not meet the previous one's resend wait.
const usedSuperadmins = new Set();
const superadminStart = Math.floor(Math.random() * SUPERADMINS.length);
export function freshSuperadmin() {
  for (let i = 0; i < SUPERADMINS.length; i++) {
    const phone = SUPERADMINS[(superadminStart + i) % SUPERADMINS.length];
    if (!usedSuperadmins.has(phone)) {
      usedSuperadmins.add(phone);
      return phone;
    }
  }
  throw new Error('Out of superadmin numbers for the UI tests; add more in e2e/superadmins.js.');
}

// A superadmin session token (kept per API, signed in through the API, not the page).
const adminTokens = new Map();
async function adminToken() {
  const key = apiBase();
  if (adminTokens.has(key)) return adminTokens.get(key);
  const phone = freshSuperadmin();
  const asked = await apiCall('POST', '/api/auth/request-otp', { body: { phone } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const code = await latestCode(phone);
  const verified = await apiCall('POST', '/api/auth/verify-otp', { body: { phone, code } });
  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  adminTokens.set(key, verified.body.token);
  return verified.body.token;
}

// Adds a number as an agent (as a superadmin would), so it can sign in. Already added is fine.
export async function registerAgent(phone, name = 'Test Agent') {
  const res = await apiCall('POST', '/api/agents', {
    token: await adminToken(),
    body: { phone, name },
  });
  expect([200, 201, 409], JSON.stringify(res.body)).toContain(res.status);
}

// Reads the latest code the console SMS provider printed for this number.
export async function latestCode(phone) {
  let code;
  await expect(async () => {
    const log = test.info().project.name.startsWith('ocr') ? OCR_SERVER_LOG : SERVER_LOG;
    const lines = readFileSync(log, 'utf8')
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

// Only added agents and superadmins can sign in, so the number is first added as an agent, unless
// `register: false` (to test what an unregistered number sees) or it is a superadmin's.
export async function requestCodeFor(page, phone, { register = true } = {}) {
  if (register && !SUPERADMINS.includes(phone)) await registerAgent(phone);
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
