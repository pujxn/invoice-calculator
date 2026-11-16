import { test, expect } from '@playwright/test';
import { latestCode, requestCodeFor, shot, uniquePhone } from './helpers.js';

test('signed-out visitors are sent to the sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await shot(page, 'login-01-phone-entry');
});

test('an invalid number shows an error and sends no code', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('07700 900123');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('alert')).toContainText('international format');
  await expect(page.getByLabel('6-digit code')).toBeHidden();
  await shot(page, 'login-02-invalid-number');
});

test('sign in with a code, stay signed in on reload, then sign out', async ({ page }) => {
  const phone = uniquePhone();
  await page.goto('/login');
  await requestCodeFor(page, phone);
  await expect(page.getByText(phone)).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend code in \d+s/ })).toBeDisabled();
  await shot(page, 'login-03-code-entry');

  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Signed in as ${phone}`)).toBeVisible();
  await shot(page, 'login-05-signed-in');

  await page.reload();
  await expect(page.getByText(`Signed in as ${phone}`)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong code shows the tries left and the right code still works', async ({ page }) => {
  const phone = uniquePhone();
  await page.goto('/login');
  await requestCodeFor(page, phone);
  const good = await latestCode(phone);
  const wrong = good === '000000' ? '111111' : '000000';

  await page.getByLabel('6-digit code').fill(wrong);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong code. 4 tries left.');
  await shot(page, 'login-04-wrong-code');

  await page.getByLabel('6-digit code').fill(good);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as ${phone}`)).toBeVisible();
});

test('requesting a second code straight away is refused with a wait time', async ({ page }) => {
  const phone = uniquePhone();
  await page.goto('/login');
  await requestCodeFor(page, phone);
  await page.getByRole('button', { name: 'Change number' }).click();
  await expect(page.getByLabel('Mobile number')).toHaveValue(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('alert')).toContainText(/Please wait \d+ seconds/);
  await shot(page, 'login-06-resend-too-soon');
});

test('the code box accepts digits only', async ({ page }) => {
  const phone = uniquePhone();
  await page.goto('/login');
  await requestCodeFor(page, phone);
  await page.getByLabel('6-digit code').pressSequentially('12ab34');
  await expect(page.getByLabel('6-digit code')).toHaveValue('1234');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});
