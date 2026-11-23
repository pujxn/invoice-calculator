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
// A handwriting-style note on ruled paper, photographed (made by server/bench/make-corpus.mjs).
const HANDWRITTEN = fileURLToPath(
  new URL('../server/test/fixtures/ocr/handwritten-ruled-photo.jpg', import.meta.url),
);
const HANDWRITTEN_AMOUNTS = ['5190.00', '296208.00'];

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

  // Plain numbers, no currency sign. Every reading agreed on this clean picture, so each amount
  // is flagged High confidence; the note still asks the user to check against the picture.
  expect([reading.debit, reading.credit]).toEqual(['125050.00', '40000.00']);
  expect(reading.amountConfidence).toEqual({ debit: 'high', credit: 'high' });
  await expect(debit(page)).toHaveValue('125050.00');
  await expect(credit(page)).toHaveValue('40000.00');
  await expect(page.getByTestId('read-with')).toHaveText('Local OCR');
  await expect(page.getByText(/local OCR \(free, no AI\)/)).toBeVisible();
  await expect(page.getByTestId('debit-flag')).toHaveText('High confidence');
  await expect(page.getByTestId('credit-flag')).toHaveText('High confidence');
  await expect(page.getByText(/check each amount against your picture/)).toBeVisible();
  await expect(page.getByText(/left empty|could not be read/)).toHaveCount(0);
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

test('a handwritten note on ruled paper is read, and each amount says how sure it is', async ({
  page,
}) => {
  await signIn(page);
  await upload(page, HANDWRITTEN);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  const response = page.waitForResponse((r) => r.url().endsWith('/extract'));
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible({ timeout: 80_000 });
  const reading = await (await response).json();
  // Whatever the reader filled in carries a flag; nothing it was unsure of is called high.
  for (const field of ['debit', 'credit']) {
    if (reading[field] === null) {
      expect(reading.amountConfidence[field]).toBeNull();
      await expect(page.getByTestId(`${field}-flag`)).toHaveCount(0);
    } else {
      expect(['high', 'low']).toContain(reading.amountConfidence[field]);
      await expect(page.getByTestId(`${field}-flag`)).toHaveAttribute(
        'data-flag',
        reading.amountConfidence[field],
      );
    }
  }
  expect([reading.debit, reading.credit]).toEqual(HANDWRITTEN_AMOUNTS);
  await expectNoSideScroll(page);
  await shot(page, 'method-04b-result-handwritten');
});

test('amounts to double-check are flagged in pink, sure ones in green, in light and dark', async ({
  page,
}) => {
  await page.route(EXTRACT, (route) =>
    route.fulfill({
      json: {
        invoiceId: 'a'.repeat(32),
        provider: 'ocr',
        model: 'tesseract',
        imageDeleted: true,
        debit: '248025.00',
        credit: '91500.00',
        currency: 'INR',
        confidence: 'medium',
        amountConfidence: { debit: 'high', credit: 'low' },
        notes:
          'Read with free OCR on the server (no AI). OCR can misread digits, so check each amount against your picture. Double-check the Credit amount: the readings did not all agree.',
        warnings: [],
      },
    }),
  );
  await signIn(page);
  await upload(page, demo('demo-4-tricky-blurry.jpg'));
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
  await expect(page.getByTestId('debit-flag')).toHaveText('High confidence');
  await expect(page.getByTestId('credit-flag')).toHaveText('Low confidence');
  await expect(credit(page)).toHaveAccessibleDescription(/double-check this amount/);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await shot(page, `flags-01-high-and-low-${scheme}`);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  const darkAxe = await new AxeBuilder({ page }).analyze();
  expect(darkAxe.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light' });

  // Once the person corrects the amount, it is theirs: the flag goes.
  await credit(page).fill('91600.00');
  await expect(page.getByTestId('credit-flag')).toHaveCount(0);
  await expect(page.getByTestId('debit-flag')).toHaveText('High confidence');
  await shot(page, 'flags-02-corrected');
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

test('a batch of three demo invoices is read by Local OCR into one combined total', async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByTestId('file-input')
    .setInputFiles([
      demo('demo-1-net-debit.png'),
      demo('demo-2-net-credit.png'),
      demo('demo-3-balanced.png'),
      NOT_INVOICE,
    ]);
  await expect(page.getByRole('heading', { name: 'Several invoices at once' })).toBeVisible();
  await expect(page.getByText('All 4 finished.')).toBeVisible({ timeout: 75_000 });

  // The three real invoices are counted; the picture with no invoice in it fails on its own.
  await expect(page.locator('.batch-row.done')).toHaveCount(3);
  await expect(page.locator('.batch-row.failed')).toHaveCount(1);
  await expect(page.getByTestId('total-debit')).toHaveText('₹2,19,050.00');
  await expect(page.getByTestId('total-credit')).toHaveText('₹2,16,575.00');
  const total = page.getByTestId('batch-final');
  await expect(total).toContainText('Net Debit');
  await expect(total).toContainText('₹2,475.00');
  await expect(page.locator('.batch-row.done').first()).toContainText('Read with Local OCR');
  await shot(page, 'batch-08-real-ocr');
});
