import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));

// The AI is never called: either the built-in mock reads the picture, or the test answers the
// extract call itself with the amounts it wants to calculate.
const EXTRACT = '**/api/invoices/*/extract';
const debit = (page) => page.getByLabel(/^Debit/);
const credit = (page) => page.getByLabel(/^Credit/);
const final = (page) => page.getByTestId('final');
const calculateButton = (page) => page.getByRole('button', { name: 'Calculate final amount' });
const finalHeading = (page) => page.getByRole('heading', { name: 'Final amount' });

const reading = (over = {}) => ({
  invoiceId: 'a'.repeat(32),
  provider: 'claude',
  model: 'claude-test',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'GBP',
  confidence: 'high',
  notes: '',
  warnings: [],
  lineItems: [],
  itemTotals: null,
  ...over,
});

// Signs in, uploads a picture, and "reads" it with the given answer; ends on the review screen.
async function readInvoice(page, over) {
  await signIn(page);
  await page.getByTestId('file-input').setInputFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  if (over) {
    await page.route(EXTRACT, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reading(over)),
      }),
    );
  }
  await page.getByRole('button', { name: 'Read amounts' }).click();
  await expect(page.getByRole('heading', { name: 'Amounts we found' })).toBeVisible();
}

async function openResult(page, over) {
  await readInvoice(page, over);
  await calculateButton(page).click();
  await expect(finalHeading(page)).toBeVisible();
}

const expectedNet = (d, c) => {
  const cents = (t) => {
    const [w, f = ''] = (t || '0').split('.');
    return BigInt(w) * 100n + BigInt(f.padEnd(2, '0'));
  };
  const n = cents(d) - cents(c);
  const abs = n < 0n ? -n : n;
  return {
    label: n > 0n ? 'Net Debit' : n < 0n ? 'Net Credit' : 'Balanced',
    amount: `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`,
  };
};

test('the calculate API needs a signed-in user', async ({ request }) => {
  const res = await request.post('/api/invoices/calculate', {
    data: { debit: '5', credit: '1' },
  });
  expect(res.status()).toBe(401);
});

test('read an invoice, calculate, and see the final amount', async ({ page }) => {
  await readInvoice(page);
  await shot(page, 'calc-01-review-with-calculate');
  const d = await debit(page).inputValue();
  const c = await credit(page).inputValue();

  await calculateButton(page).click();
  await expect(finalHeading(page)).toBeFocused();
  const want = expectedNet(d, c);
  await expect(final(page)).toContainText(want.label);
  // The demo amounts are in GBP; the total is grouped with commas.
  await expect(final(page).locator('.final-amount')).toHaveText(
    `£${Number(want.amount.split('.')[0]).toLocaleString('en')}.${want.amount.split('.')[1]}`,
  );
  const table = page.getByRole('table', { name: 'How it was worked out' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'calc-02-result-net-debit');
});

test('editing an amount updates the result straight away', async ({ page }) => {
  await openResult(page, { debit: '1250.50', credit: '400.00' });
  await expect(final(page)).toContainText('Net Debit');
  await expect(final(page).locator('.final-amount')).toHaveText('£850.50');

  await credit(page).fill('975.50');
  await expect(final(page).locator('.final-amount')).toHaveText('£275.00');

  await credit(page).fill('2000');
  await expect(final(page)).toContainText('Net Credit');
  await expect(final(page).locator('.final-amount')).toHaveText('£749.50');
});

test('Net Credit, Balanced, and one-sided invoices', async ({ page }) => {
  await openResult(page, { debit: '300.00', credit: '975.50' });
  await expect(final(page)).toContainText('Net Credit');
  await expect(final(page).locator('.final-amount')).toHaveText('£675.50');
  await expect(final(page)).toContainText('Debit £300.00 − Credit £975.50 = −£675.50');
  await shot(page, 'calc-03-result-net-credit');

  await debit(page).fill('975.50');
  await expect(final(page)).toContainText('Balanced');
  await expect(final(page).locator('.final-amount')).toHaveText('£0.00');
  await shot(page, 'calc-04-result-balanced');

  await debit(page).fill('720');
  await credit(page).fill('');
  await expect(final(page)).toContainText('Net Debit');
  await expect(final(page).locator('.final-amount')).toHaveText('£720.00');

  await debit(page).fill('');
  await credit(page).fill('99.99');
  await expect(final(page)).toContainText('Net Credit');
  await expect(final(page).locator('.final-amount')).toHaveText('£99.99');
});

test('exact decimals, thousands separators and very large amounts', async ({ page }) => {
  await openResult(page, { debit: '0.30', credit: '0.10' });
  await expect(final(page).locator('.final-amount')).toHaveText('£0.20'); // floats give 0.19999999999999998

  await debit(page).fill('1,000,000.07');
  await credit(page).fill('0.01');
  await expect(final(page).locator('.final-amount')).toHaveText('£1,000,000.06');

  await debit(page).fill('999999999999.99');
  await credit(page).fill('0.01');
  await expect(final(page).locator('.final-amount')).toHaveText('£999,999,999,999.98');
  await expectNoSideScroll(page);
  await shot(page, 'calc-05-result-large-amount');
});

test('zero, blanks, negatives and too many decimals', async ({ page }) => {
  await openResult(page, { debit: '10.00', credit: '4.00' });

  await debit(page).fill('0');
  await credit(page).fill('0.00');
  await expect(final(page)).toContainText('Balanced');

  await debit(page).fill('');
  await credit(page).fill('');
  await expect(final(page)).toContainText('No final amount yet');
  await expect(final(page)).toContainText('Enter at least one amount');
  await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
  await shot(page, 'calc-06-result-needs-an-amount');

  await debit(page).fill('-5');
  await expect(final(page)).toContainText('Amounts cannot be negative');
  await expect(debit(page)).toHaveAttribute('aria-invalid', 'true');

  await debit(page).fill('12.345');
  await expect(final(page)).toContainText('Use at most 2 decimal places');

  await debit(page).fill('12.34');
  await expect(final(page)).toContainText('Net Debit');
});

test('with both boxes blank, Calculate asks for an amount and stays on the screen', async ({
  page,
}) => {
  await readInvoice(page, { debit: null, credit: null });
  await calculateButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Enter at least one amount');
  await expect(finalHeading(page)).toBeHidden();
  await shot(page, 'calc-07-review-needs-an-amount');
  await debit(page).fill('5');
  await expect(page.getByRole('alert')).toBeHidden();
  await calculateButton(page).click();
  await expect(final(page)).toContainText('Net Debit');
});

test('amounts typed by hand work the same way', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('file-input').setInputFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Type the amounts instead' }).click();
  await debit(page).fill('820.40');
  await credit(page).fill('20');
  await calculateButton(page).click();
  await expect(final(page)).toContainText('Net Debit');
  await expect(final(page).locator('.final-amount')).toHaveText('800.40'); // no currency known
});

test('the result and the edits survive a reload; Back keeps them', async ({ page }) => {
  await openResult(page, { debit: '1250.50', credit: '400.00' });
  await credit(page).fill('50');
  await page.reload();
  await expect(finalHeading(page)).toBeVisible();
  await expect(credit(page)).toHaveValue('50');
  await expect(final(page).locator('.final-amount')).toHaveText('£1,200.50');

  await page.getByRole('button', { name: 'Back to the invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Amounts we found' })).toBeFocused();
  await expect(credit(page)).toHaveValue('50');
  await calculateButton(page).click();
  await expect(final(page).locator('.final-amount')).toHaveText('£1,200.50');
});

test('Reset to what was found restores the original amounts', async ({ page }) => {
  await openResult(page, { debit: '1250.50', credit: '400.00' });
  await expect(page.getByRole('button', { name: 'Reset to what was found' })).toBeHidden();
  await debit(page).fill('1');
  await page.getByRole('button', { name: 'Reset to what was found' }).click();
  await expect(debit(page)).toHaveValue('1250.50');
  await expect(final(page).locator('.final-amount')).toHaveText('£850.50');
});

test('Start a new invoice returns to upload without signing in again', async ({ page }) => {
  await openResult(page, { debit: '5.00', credit: '1.00' });
  await page.getByRole('button', { name: 'Start a new invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
});

test('Copy result puts the answer on the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openResult(page, { debit: '1250.50', credit: '400.00' });
  await page.getByRole('button', { name: 'Copy result' }).click();
  await expect(page.getByText('Copied to the clipboard.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Net Debit £850.50 (Debit £1,250.50 − Credit £400.00)',
  );
  await shot(page, 'calc-08-copied');
});

test('the calculate API gives the same answer as the screen', async ({ page }) => {
  await signIn(page);
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('invoice-calculator.session')).token,
  );
  const headers = { Authorization: `Bearer ${token}` };
  const ok = await page.request.post('/api/invoices/calculate', {
    headers,
    data: { debit: '0.30', credit: '0.10' },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ net: '0.20', type: 'debit' });
  const lines = await page.request.post('/api/invoices/calculate', {
    headers,
    data: { items: ['1000.50', '250.00', '-400.00'] },
  });
  expect(await lines.json()).toMatchObject({ net: '850.50', type: 'debit', lineCount: 3 });
  const bad = await page.request.post('/api/invoices/calculate', {
    headers,
    data: { debit: 12.5 },
  });
  expect(bad.status()).toBe(400);
});

for (const scheme of ['light', 'dark']) {
  test(`the result screen passes the accessibility checks (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openResult(page, { debit: '1250.50', credit: '400.00' });
    const check = async () => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    };
    await check();
    await shot(page, `calc-09-result-${scheme}`);

    await credit(page).fill('975.50'); // Net Credit
    await check();
    await debit(page).fill('975.50'); // Balanced
    await check();
    await debit(page).fill('-1'); // an error state
    await check();
    await shot(page, `calc-10-result-error-${scheme}`);
  });
}
