import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

// Saved invoice history: an invoice is saved when its final amount shows, and the History screens
// list, search, filter and open what was saved. The reader is the built-in mock; nothing external
// is called.
const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));

const debit = (page) => page.getByLabel(/^Debit/);
const credit = (page) => page.getByLabel(/^Credit/);
const final = (page) => page.getByTestId('final');
const button = (page, name) => page.getByRole('button', { name });
const heading = (page, name) => page.getByRole('heading', { name });
const items = (page) => page.getByRole('list', { name: 'Saved invoices' }).getByRole('link');

// Saves invoices straight through the API, signed in as the person the page is signed in as.
async function seed(page, invoices) {
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('invoice-calculator.session')).token,
  );
  for (const body of invoices) {
    const res = await page.request.post('/api/history', {
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    });
    expect(res.status()).toBe(201);
  }
}

// Today and a day either side, as the YYYY-MM-DD text a date box takes, in the browser's time zone.
async function days(page) {
  return page.evaluate(() => {
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    return { yesterday: day(-1), today: day(0), tomorrow: day(1) };
  });
}

const SEED = [
  { debit: '1250.00', credit: '400.00', method: 'ocr' }, // Net Debit 850
  { debit: '300.00', credit: '975.50', method: 'claude' }, // Net Credit 675.50
  { debit: '500', credit: '500', method: 'manual' }, // Balanced
  { debit: '12,34,567.25', credit: '0', method: 'ocr' }, // Net Debit 12,34,567.25
];

test('an invoice is saved when its final amount shows, follows corrections, and can be opened and deleted', async ({
  page,
}) => {
  await signIn(page);
  await page.getByTestId('file-input').setInputFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await button(page, 'Read amounts').click();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
  const d = await debit(page).inputValue();
  await button(page, 'Calculate final amount').click();
  await expect(heading(page, 'Final amount')).toBeVisible();

  // Saved by itself, once.
  const status = page.getByTestId('history-status');
  await expect(status).toContainText('Saved to your history');
  await shot(page, 'history-01-saved-note');

  // A correction on this screen updates that same record.
  await credit(page).fill('1');
  await debit(page).fill('1000');
  await expect(final(page)).toContainText('Net Debit');
  await expect(status).toContainText('Saved to your history');
  await status.getByRole('link', { name: 'View history' }).click();

  await expect(heading(page, 'History')).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('Net Debit');
  await expect(items(page).first()).toContainText('₹999.00');
  await expect(items(page).first()).toContainText('Debit ₹1,000.00 · Credit ₹1.00');
  expect(d).not.toBe('1000'); // the saved figure is the corrected one, not the one that was read

  // Open it.
  await items(page).first().click();
  await expect(heading(page, 'Saved invoice')).toBeFocused();
  await expect(final(page)).toContainText('₹999.00');
  await expect(page.getByText('Demo reader')).toBeVisible();
  await expect(page.getByText(/deleted after it was read/)).toBeVisible();
  await expectNoSideScroll(page);

  // Delete it, after being asked.
  await button(page, 'Delete').click();
  await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
  await button(page, 'Keep it').click();
  await expect(heading(page, 'Saved invoice')).toBeVisible();
  await button(page, 'Delete').click();
  await button(page, 'Yes, delete it').click();
  await expect(heading(page, 'History')).toBeVisible();
  await expect(page.getByTestId('history-empty')).toContainText('Nothing saved yet');
});

test('an invoice typed by hand is saved too, without a picture', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('file-input').setInputFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await button(page, 'Type the amounts instead').click();
  await debit(page).fill('100');
  await credit(page).fill('40.5');
  await button(page, 'Calculate final amount').click();
  await expect(page.getByTestId('history-status')).toContainText('Saved to your history');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(items(page)).toHaveCount(1);
  await items(page).first().click();
  await expect(page.getByText('Typed by hand', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/The amounts were typed by hand\. The picture was deleted/),
  ).toBeVisible();
  await shot(page, 'history-05-entry-typed');
});

test('two invoices in a row are two records, and the first is not overwritten by the second', async ({
  page,
}) => {
  await signIn(page);
  for (const [d, c] of [
    ['100', '40'],
    ['7', '25'],
  ]) {
    await page.getByTestId('file-input').setInputFiles(PNG);
    await expect(page.getByText('Picture uploaded.')).toBeVisible();
    await button(page, 'Type the amounts instead').click();
    await debit(page).fill(d);
    await credit(page).fill(c);
    await button(page, 'Calculate final amount').click();
    await expect(page.getByTestId('history-status')).toContainText('Saved to your history');
    await button(page, 'Start a new invoice').click();
    await expect(heading(page, 'Upload your invoice')).toBeVisible();
  }
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0)).toContainText('Net Credit');
  await expect(items(page).nth(0)).toContainText('₹18.00');
  await expect(items(page).nth(1)).toContainText('Net Debit');
  await expect(items(page).nth(1)).toContainText('₹60.00');
});

test('search and filters narrow the list, and Clear brings everything back', async ({ page }) => {
  await signIn(page);
  await seed(page, SEED);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(items(page)).toHaveCount(4);
  await expect(page.getByTestId('history-count')).toContainText('Showing 4 of 4 invoices');
  // Newest first: the last one saved is on top.
  await expect(items(page).first()).toContainText('₹12,34,567.25');
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'history-02-list');

  // Search: an amount typed the way a person writes it, then words.
  const search = page.getByLabel('Search');
  await search.fill('₹1,250');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('₹850.00');
  await search.fill('975.5');
  await expect(items(page).first()).toContainText('Net Credit');
  await search.fill('balanced');
  await expect(items(page)).toHaveCount(1);
  await search.fill('nothing like this');
  await expect(page.getByTestId('history-empty')).toContainText('No saved invoices match');
  await shot(page, 'history-04-no-match');
  await button(page, 'Clear search and filters').click();
  await expect(items(page)).toHaveCount(4);
  await expect(search).toHaveValue('');

  // Kind of result.
  await page.getByLabel('Show').selectOption('debit');
  await expect(items(page)).toHaveCount(2);
  await page.getByLabel('Show').selectOption('credit');
  await expect(items(page)).toHaveCount(1);
  await page.getByLabel('Show').selectOption('');
  await expect(items(page)).toHaveCount(4);

  // Dates: everything was saved just now, so today holds all of it and the days around it none.
  const { yesterday, today, tomorrow } = await days(page);
  await page.getByLabel('From').fill(today);
  await page.getByLabel('To').fill(today);
  await expect(items(page)).toHaveCount(4);
  await page.getByLabel('From').fill(tomorrow);
  await page.getByLabel('To').fill('');
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.getByLabel('From').fill('');
  await page.getByLabel('To').fill(yesterday);
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.getByLabel('To').fill(tomorrow);
  await expect(items(page)).toHaveCount(4);

  // A backwards range is flagged instead of searched.
  await page.getByLabel('From').fill(tomorrow);
  await page.getByLabel('To').fill(yesterday);
  await expect(page.getByRole('alert')).toContainText('From date is after the To date');
  await shot(page, 'history-03-filters');
  await button(page, 'Clear search and filters').click();
  await expect(items(page)).toHaveCount(4);
});

test('a long history is shown a page at a time', async ({ page }) => {
  await signIn(page);
  await seed(
    page,
    Array.from({ length: 23 }, (_, i) => ({ debit: String(i + 1), credit: '0', method: 'manual' })),
  );
  await page.goto('/history');
  await expect(items(page)).toHaveCount(20);
  await expect(page.getByTestId('history-count')).toContainText('Showing 20 of 23 invoices');
  await button(page, 'Show more').click();
  await expect(items(page)).toHaveCount(23);
  await expect(button(page, 'Show more')).toHaveCount(0);
});

test('one person never sees another person’s history', async ({ page, browser }) => {
  await signIn(page);
  await seed(page, [SEED[0]]);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(items(page)).toHaveCount(1);
  const href = await items(page).first().getAttribute('href');

  const other = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: test.info().project.use.viewport,
  });
  const otherPage = await other.newPage();
  await signIn(otherPage);
  await otherPage.goto('/history');
  await expect(otherPage.getByTestId('history-empty')).toContainText('Nothing saved yet');
  await otherPage.goto(href);
  await expect(heading(otherPage, 'Invoice not found')).toBeVisible();
  await other.close();
});

test('the history screens work in light and dark, with no accessibility violations', async ({
  page,
}) => {
  await signIn(page);
  await seed(page, SEED);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(items(page)).toHaveCount(4);

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const list = await new AxeBuilder({ page }).analyze();
    expect(list.violations, `${scheme} list`).toEqual([]);
    await shot(page, `history-list-${scheme}`);
  }

  await items(page).nth(1).click(); // the Net Credit one
  await expect(heading(page, 'Saved invoice')).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const entry = await new AxeBuilder({ page }).analyze();
    expect(entry.violations, `${scheme} entry`).toEqual([]);
    await shot(page, `history-entry-${scheme}`);
  }
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
});
