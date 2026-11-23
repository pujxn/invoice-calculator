import { test, expect } from '@playwright/test';
import {
  expectNoSideScroll,
  expectTouchFriendly,
  latestCode,
  registerAgent,
  requestCodeFor,
  shot,
  uniquePhone,
} from './helpers.js';

// Phones tap with a finger; the desktop project has no touch, so it clicks instead.
async function tapOrClick(locator) {
  if (test.info().project.use.hasTouch) await locator.tap();
  else await locator.click();
}

test('phone entry fits the screen, has big touch targets and opens the phone keypad', async ({
  page,
}) => {
  await page.goto('/login');
  const phone = page.getByLabel('Mobile number');
  await expect(phone).toHaveAttribute('type', 'tel');
  await expect(phone).toHaveAttribute('inputmode', 'tel');
  await expect(phone).toHaveAttribute('autocomplete', 'tel');
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'login-01-phone-entry');
});

test('code entry offers the numeric keypad and SMS code autofill', async ({ page }) => {
  await page.goto('/login');
  await requestCodeFor(page, uniquePhone());
  const code = page.getByLabel('6-digit code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('pattern', '[0-9]*');
  await expect(code).toHaveAttribute('maxlength', '6');
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
});

test('long error messages and a long number do not break the layout', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('+' + '4'.repeat(40));
  await tapOrClick(page.getByRole('button', { name: 'Send code' }));
  await expect(page.getByRole('alert')).toBeVisible();
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
});

test('on phones the form buttons are full width; on desktop they are not', async ({
  page,
}, testInfo) => {
  await page.goto('/login');
  await requestCodeFor(page, uniquePhone());
  const form = await page.locator('form').boundingBox();
  const signIn = await page.getByRole('button', { name: 'Sign in' }).boundingBox();
  if (testInfo.project.name === 'desktop') {
    expect(signIn.width).toBeLessThan(form.width / 2);
  } else {
    expect(signIn.width).toBeGreaterThan(form.width - 2);
  }
});

test('the whole sign-in works with finger taps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'touch only');
  const phone = uniquePhone();
  await registerAgent(phone);
  await page.goto('/login');
  await page.getByLabel('Mobile number').tap();
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).tap();
  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await page.getByRole('button', { name: 'Sign in' }).tap();
  await expect(page.getByText(`Signed in as ${phone}`)).toBeVisible();
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await page.getByRole('button', { name: 'Sign out' }).tap();
  await expect(page).toHaveURL(/\/login$/);
});

test('Enter on the phone keyboard submits the number', async ({ page }) => {
  const phone = uniquePhone();
  await registerAgent(phone);
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Mobile number').press('Enter');
  await expect(page.getByLabel('6-digit code')).toBeVisible();
});
