import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

// These run against an API that really reads pictures with the free local OCR and has no AI key
// (see playwright.config.js: ports 4101 and 5274). The AI itself is never called: where a test
// needs "AI is set up", the two API answers that say so are staged in the browser.
const demo = (name) => fileURLToPath(new URL(`../docs/demo/${name}`, import.meta.url));
const NOT_INVOICE = fileURLToPath(
  new URL('../server/test/fixtures/ocr/not-an-invoice.png', import.meta.url),
);

const METHODS = '**/api/invoices/reading-methods';
const EXTRACT = '**/api/invoices/*/extract';
const upload = (page, file) => page.getByTestId('file-input').setInputFiles(file);
const readButton = (page) => page.getByRole('button', { name: 'Read amounts' });
const resultsHeading = (page) => page.getByRole('heading', { name: 'Amounts we found' });
const debit = (page) => page.getByLabel(/^Debit/);
const credit = (page) => page.getByLabel(/^Credit/);
const method = (page, name) => page.getByRole('radio', { name });

const bothAvailable = {
  default: 'ocr',
  methods: [
    { id: 'ocr', label: 'Local OCR', available: true },
    { id: 'claude', label: 'AI (Claude)', available: true },
  ],
};
const stageBoth = (page) => page.route(METHODS, (route) => route.fulfill({ json: bothAvailable }));

test('with no AI key, Local OCR is chosen and AI is greyed out with the reason', async ({
  page,
}) => {
  await signIn(page);
  const group = page.getByRole('group', { name: 'Read with' });
  await expect(group).toBeVisible();
  await expect(method(page, 'Local OCR')).toBeChecked();
  await expect(method(page, 'AI (Claude)')).toBeDisabled();
  await expect(group).toContainText('AI (Claude) is not available');
  await expect(group).toContainText('no ANTHROPIC_API_KEY');
  // The reason is attached to the disabled choice for screen readers.
  await expect(method(page, 'AI (Claude)')).toHaveAccessibleDescription(
    /not set up on this server/,
  );
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'method-01-ai-unavailable');
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test('read a clean invoice with Local OCR: both amounts', async ({ page }) => {
  await signIn(page);
  await upload(page, demo('demo-1-net-debit.png'));
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await shot(page, 'method-02-ready-local-ocr');

  const response = page.waitForResponse((r) => r.url().endsWith('/extract'));
  await readButton(page).click();
  await expect(page.getByText(/Reading your invoice with local OCR/)).toBeVisible();
  await expect(resultsHeading(page)).toBeVisible({ timeout: 60_000 });
  const reading = await (await response).json();
  expect(reading.provider).toBe('ocr');

  // Plain numbers, no currency sign. OCR cannot prove an amount, so it says Medium and asks the
  // user to check.
  expect([reading.debit, reading.credit]).toEqual(['125050.00', '40000.00']);
  await expect(debit(page)).toHaveValue('125050.00');
  await expect(credit(page)).toHaveValue('40000.00');
  await expect(page.getByTestId('read-with')).toHaveText('Local OCR');
  await expect(page.getByText(/local OCR \(free, no AI\)/)).toBeVisible();
  await expect(page.getByText(/Confidence:/)).toContainText('Medium');
  await expect(page.getByText(/check each amount against your picture/)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expectNoSideScroll(page);
  await shot(page, 'method-03-result-local-ocr');

  // And the rest of the app carries on as before.
  await page.getByRole('button', { name: 'Calculate final amount' }).click();
  await expect(page.getByTestId('final')).toContainText('Net Debit');
});

test('a tilted, blurry phone photo is still read', async ({ page }) => {
  await signIn(page);
  await upload(page, demo('demo-4-tricky-blurry.jpg'));
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible({ timeout: 80_000 });
  await expect(debit(page)).toHaveValue('248025.00');
  await expect(credit(page)).toHaveValue('91500.00');
  await shot(page, 'method-04-result-blurry-photo');
});

test('a picture that is not an invoice is refused kindly and the amounts can be typed', async ({
  page,
}) => {
  await signIn(page);
  await upload(page, NOT_INVOICE);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('could not find an invoice', {
    timeout: 60_000,
  });
  await shot(page, 'method-05-not-an-invoice');
  await page.getByRole('button', { name: 'Type the amounts instead' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the amounts' })).toBeVisible();
});

test('with AI available, the switch changes which reader the request asks for, and is remembered', async ({
  page,
}) => {
  await stageBoth(page);
  const asked = [];
  await page.route(EXTRACT, async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body?.method);
    if (body?.method !== 'claude') return route.continue();
    await route.fulfill({
      json: {
        invoiceId: 'a'.repeat(32),
        provider: 'claude',
        model: 'claude-test',
        imageDeleted: true,
        debit: '125050.00',
        credit: '40000.00',
        currency: 'INR',
        confidence: 'high',
        notes: 'Clear photo.',
        warnings: [],
      },
    });
  });

  await signIn(page);
  await expect(method(page, 'Local OCR')).toBeChecked();
  await expect(method(page, 'AI (Claude)')).toBeEnabled();
  await shot(page, 'method-06-both-available-local');

  // Choosing AI works by tap/click, is shown, and survives a reload of the page.
  await method(page, 'AI (Claude)').check();
  await expect(method(page, 'AI (Claude)')).toBeChecked();
  await expect(page.getByText(/Sent to the AI service/)).toBeVisible();
  await shot(page, 'method-07-both-available-ai');
  await page.reload();
  await expect(method(page, 'AI (Claude)')).toBeChecked();

  await upload(page, demo('demo-1-net-debit.png'));
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
  expect(asked).toEqual(['claude']);
  await expect(page.getByTestId('read-with')).toHaveText('AI (Claude)');
  await expect(page.getByText(/Read from your picture by AI\./)).toBeVisible();
  await shot(page, 'method-08-result-ai');
});

test('the switch works from the keyboard', async ({ page }) => {
  await stageBoth(page);
  await signIn(page);
  await method(page, 'Local OCR').focus();
  await page.keyboard.press('ArrowRight');
  await expect(method(page, 'AI (Claude)')).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(method(page, 'Local OCR')).toBeChecked();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test('if the server cannot say which readers it has, there is no switch and reading still works', async ({
  page,
}) => {
  await page.route(METHODS, (route) => route.fulfill({ status: 500, json: { error: 'no' } }));
  await signIn(page);
  await expect(page.getByRole('group', { name: 'Read with' })).toHaveCount(0);
  await upload(page, demo('demo-1-net-debit.png'));
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible({ timeout: 60_000 });
  await expect(debit(page)).toHaveValue('125050.00');
});

test('a method the server refuses shows a clear message and keeps the picture', async ({
  page,
}) => {
  await stageBoth(page); // the page thinks AI works, the server knows it does not
  await signIn(page);
  await method(page, 'AI (Claude)').check();
  await upload(page, demo('demo-3-balanced.png'));
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('AI (Claude) is not available');
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await method(page, 'Local OCR').check();
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible({ timeout: 60_000 });
});
