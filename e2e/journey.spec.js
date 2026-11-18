import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  expectNoSideScroll,
  expectTouchFriendly,
  latestCode,
  requestCodeFor,
  shot,
  signIn,
  uniquePhone,
} from './helpers.js';

// End-to-end journeys: the whole app the way a person uses it, from the sign-in screen to a
// finished invoice and back out, on a phone, a small phone and a desktop window. The SMS code is
// read from the (console) SMS log and the AI is the built-in mock, so nothing external is called.
const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));
const JPG = fileURLToPath(new URL('./fixtures/sample-invoice.jpg', import.meta.url));
const EXTRACT = '**/api/invoices/*/extract';

const debit = (page) => page.getByLabel(/^Debit/);
const credit = (page) => page.getByLabel(/^Credit/);
const final = (page) => page.getByTestId('final');
const button = (page, name) => page.getByRole('button', { name });
const heading = (page, name) => page.getByRole('heading', { name });

const cents = (text) => {
  const [whole, fraction = ''] = (text || '0').split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const net = (d, c) => {
  const n = cents(d) - cents(c);
  const abs = n < 0n ? -n : n;
  return {
    label: n > 0n ? 'Net Debit' : n < 0n ? 'Net Credit' : 'Balanced',
    amount: `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`,
  };
};

async function upload(page, file = PNG) {
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
}

async function readAmounts(page) {
  await button(page, 'Read amounts').click();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
}

test('the whole journey: sign in, upload, read, calculate, start again, sign out', async ({
  page,
}) => {
  // 1. Sign in with the one-time code.
  const phone = uniquePhone();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await shot(page, 'journey-01-sign-in');
  await requestCodeFor(page, phone);
  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await button(page, 'Sign in').click();
  await expect(heading(page, 'Upload your invoice')).toBeVisible();
  await expect(page.getByText(phone)).toBeVisible();
  await expectNoSideScroll(page);
  await shot(page, 'journey-02-upload');

  // 2. Upload a picture and read it.
  await upload(page);
  await expect(button(page, 'Read amounts')).toBeVisible();
  await shot(page, 'journey-03-uploaded');
  await readAmounts(page);
  const d = await debit(page).inputValue();
  const c = await credit(page).inputValue();
  expect(Number(d)).toBeGreaterThan(0);
  expect(Number(c)).toBeGreaterThan(0);
  await expect(page.getByText(/Demo values, not read from your picture/)).toBeVisible();
  await expectNoSideScroll(page);
  await shot(page, 'journey-04-amounts');

  // 3. Calculate. The figure on screen matches exact decimal maths on what the boxes hold.
  await button(page, 'Calculate final amount').click();
  await expect(heading(page, 'Final amount')).toBeFocused();
  const want = net(d, c);
  await expect(final(page)).toContainText(want.label);
  await expect(final(page).locator('.final-amount')).toContainText(want.amount.split('.')[1]);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'journey-05-final-amount');

  // 4. Change an amount on the result screen: it updates with no button press.
  await credit(page).fill(d); // equal amounts
  await expect(final(page)).toContainText('Balanced');
  await button(page, 'Reset to what was found').click();
  await expect(final(page)).toContainText(want.label);

  // 5. Start a new invoice: still signed in, nothing left over from the last one.
  await button(page, 'Start a new invoice').click();
  await expect(heading(page, 'Upload your invoice')).toBeFocused();
  await expect(button(page, 'Sign out')).toBeVisible();
  await expect(page.getByText('Picture uploaded.')).toHaveCount(0);
  await shot(page, 'journey-06-new-invoice');

  // 6. This time skip the AI and type the amounts.
  await upload(page, JPG);
  await button(page, 'Type the amounts instead').click();
  await expect(heading(page, 'Enter the amounts')).toBeVisible();
  await debit(page).fill('100');
  await credit(page).fill('40.5');
  await button(page, 'Calculate final amount').click();
  await expect(final(page)).toContainText('Net Debit');
  await expect(final(page).locator('.final-amount')).toHaveText('₹59.50');
  await shot(page, 'journey-07-typed-by-hand');

  // Any amount is accepted: a long decimal is kept exactly and the shown figure says it is rounded.
  await debit(page).fill('100.005');
  await credit(page).fill('40.5');
  await expect(final(page).locator('.final-amount')).toHaveText('₹59.51');
  await expect(page.getByTestId('rounded-note')).toContainText('The exact amount is ₹59.505.');
  await debit(page).fill('100');

  // 7. Sign out: back on the sign-in screen, and the protected page stays closed.
  await button(page, 'Sign out').click();
  await expect(heading(page, 'Sign in')).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('the browser Back and Forward buttons move between the amounts and the final amount', async ({
  page,
}) => {
  await signIn(page);
  await upload(page);
  await readAmounts(page);
  const start = page.url();
  await button(page, 'Calculate final amount').click();
  await expect(heading(page, 'Final amount')).toBeVisible();
  await expect(page).toHaveURL(start);

  await page.goBack();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
  await page.goForward();
  await expect(heading(page, 'Final amount')).toBeVisible();

  // The on-screen Back button does the same, and a reload on the way keeps your place.
  await page.reload();
  await expect(heading(page, 'Final amount')).toBeVisible();
  await button(page, 'Back to the invoice').click();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
  await page.reload();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
});

test('a reload at every step keeps the work', async ({ page }) => {
  await signIn(page);
  await upload(page);
  await page.reload();
  await expect(page.getByText('Picture uploaded.')).toBeVisible();

  await readAmounts(page);
  await debit(page).fill('321.10');
  await page.reload();
  await expect(heading(page, 'Amounts we found')).toBeVisible();
  await expect(debit(page)).toHaveValue('321.10');

  await button(page, 'Calculate final amount').click();
  await page.reload();
  await expect(heading(page, 'Final amount')).toBeVisible();
  await expect(debit(page)).toHaveValue('321.10');
});

test('works with the keyboard alone and keeps focus where a screen reader needs it', async ({
  page,
}) => {
  const phone = uniquePhone();
  await page.goto('/login');
  // The phone box has focus on arrival; Enter submits each step.
  await expect(page.getByLabel('Mobile number')).toBeFocused();
  await page.keyboard.type(phone);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('6-digit code')).toBeFocused();
  await page.keyboard.type(await latestCode(phone));
  await page.keyboard.press('Enter');
  await expect(heading(page, 'Upload your invoice')).toBeVisible();

  // Choose a file with the keyboard.
  const chooser = page.waitForEvent('filechooser');
  await button(page, 'Choose file').focus();
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();

  // Read amounts: the new screen's heading takes focus, and Tab goes straight to the first box.
  await button(page, 'Read amounts').focus();
  await page.keyboard.press('Space');
  await expect(heading(page, 'Amounts we found')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(debit(page)).toBeFocused();

  await button(page, 'Calculate final amount').focus();
  await page.keyboard.press('Enter');
  await expect(heading(page, 'Final amount')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(debit(page)).toBeFocused();

  // Typing in a box updates the announced figure (a polite live region).
  await expect(final(page)).toHaveAttribute('aria-live', 'polite');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('5');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('5');
  await expect(final(page)).toContainText('Balanced');

  // Start again by keyboard: focus lands on the upload heading, not on nothing.
  await button(page, 'Start a new invoice').focus();
  await page.keyboard.press('Enter');
  await expect(heading(page, 'Upload your invoice')).toBeFocused();
});

test.describe('when things go wrong', () => {
  test('five wrong codes lock the code, even the right one is then refused, a new number works', async ({
    page,
  }) => {
    const phone = uniquePhone();
    await page.goto('/login');
    await requestCodeFor(page, phone);
    const right = await latestCode(phone);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let tries = 1; tries <= 5; tries += 1) {
      await page.getByLabel('6-digit code').fill(wrong);
      await button(page, 'Sign in').click();
      await expect(page.getByRole('alert')).toContainText(
        tries < 5 ? /Wrong code/ : /Too many wrong attempts/,
      );
    }
    await page.getByLabel('6-digit code').fill(right);
    await button(page, 'Sign in').click();
    await expect(page.getByRole('alert')).toContainText(/Too many wrong attempts/);
    await expect(heading(page, 'Sign in')).toBeVisible();
    await shot(page, 'journey-err-code-locked');

    await button(page, 'Change number').click();
    const other = uniquePhone();
    await requestCodeFor(page, other);
    await page.getByLabel('6-digit code').fill(await latestCode(other));
    await button(page, 'Sign in').click();
    await expect(heading(page, 'Upload your invoice')).toBeVisible();
  });

  test('the AI service failing shows a plain message and Read amounts works on the next try', async ({
    page,
  }) => {
    await signIn(page);
    await upload(page);
    let failures = 0;
    await page.route(EXTRACT, (route) => {
      if (failures++ < 1) {
        return route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'The AI service had a problem. Please try again.',
            code: 'provider_unavailable',
          }),
        });
      }
      return route.continue();
    });
    await button(page, 'Read amounts').click();
    await expect(page.getByRole('alert')).toContainText('The AI service had a problem');
    await expect(page.getByRole('alert')).not.toContainText(/anthropic|sk-|stack/i);
    await expect(page.getByText('Picture uploaded.')).toBeVisible(); // nothing lost
    await expectNoSideScroll(page);
    await shot(page, 'journey-err-ai-failed');

    await button(page, 'Read amounts').click();
    await expect(heading(page, 'Amounts we found')).toBeVisible();
  });

  test('losing the connection while reading says so, and the picture can be read again', async ({
    page,
  }) => {
    await signIn(page);
    await upload(page);
    await page.route(EXTRACT, (route) => route.abort('connectionrefused'));
    await button(page, 'Read amounts').click();
    await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
    await page.unroute(EXTRACT);
    await button(page, 'Read amounts').click();
    await expect(heading(page, 'Amounts we found')).toBeVisible();
  });

  test('a session that ends mid-way sends the user to sign in and leaves nothing behind', async ({
    page,
  }) => {
    await signIn(page);
    await upload(page);
    await page.route(EXTRACT, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Please sign in.' }),
      }),
    );
    await button(page, 'Read amounts').click();
    await expect(heading(page, 'Sign in')).toBeVisible();
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });

  test('a wrong file type, then a right one, then a real invoice: the errors do not stick', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByTestId('file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a picture'),
    });
    await expect(page.getByRole('alert')).toContainText('not a JPEG, PNG, WebP or HEIC');
    await upload(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await readAmounts(page);
  });
});

test.describe('who can see what', () => {
  test('signing out in one tab signs out the other tab straight away', async ({
    page,
    context,
  }) => {
    await signIn(page);
    const second = await context.newPage();
    await second.goto('/');
    await expect(heading(second, 'Upload your invoice')).toBeVisible();

    await button(page, 'Sign out').click();
    await expect(heading(page, 'Sign in')).toBeVisible();
    await expect(heading(second, 'Sign in')).toBeVisible();
  });

  test("one person cannot reach another person's picture, and cannot see it after signing in", async ({
    browser,
    page,
  }) => {
    await signIn(page);
    await upload(page);
    const pictureId = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('invoice-calculator.current-invoice')).id,
    );

    const other = await browser.newContext({ baseURL: page.url().replace(/\/[^/]*$/, '') });
    try {
      const second = await other.newPage();
      await signIn(second);
      const token = await second.evaluate(
        () => JSON.parse(localStorage.getItem('invoice-calculator.session')).token,
      );
      for (const path of ['', '/image']) {
        const res = await second.request.get(`/api/invoices/${pictureId}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status()).toBe(404);
      }
      await expect(second.getByText('Picture uploaded.')).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test('signed-in visitors skip the sign-in page, and unknown addresses go home', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/login');
    await expect(heading(page, 'Upload your invoice')).toBeVisible();
    await page.goto('/no/such/page');
    await expect(page).toHaveURL(/\/$/);
    await expect(heading(page, 'Upload your invoice')).toBeVisible();
  });

  test('the API says what it is: private, JSON, and nothing is cached', async ({ request }) => {
    const res = await request.get('/api/does-not-exist');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });
});

test('with text enlarged to 200% nothing overlaps, runs off the screen or stops working', async ({
  page,
}) => {
  await signIn(page);
  // The same effect as "Larger Text" on a phone or a big browser zoom.
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expectNoSideScroll(page);
  await upload(page);
  await expectNoSideScroll(page);
  await readAmounts(page);
  await expectNoSideScroll(page);
  // A button must be clickable (it was once covered by the table above it) and its whole label
  // must stay inside it.
  const calculate = button(page, 'Calculate final amount');
  const label = await calculate.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(label[0]).toBeLessThanOrEqual(label[1]);
  await calculate.click();
  await expect(heading(page, 'Final amount')).toBeVisible();
  await debit(page).fill('999999999999999.999999999999');
  await credit(page).fill('0.01');
  await expectNoSideScroll(page);
  for (const name of ['Copy result', 'Back to the invoice', 'Start a new invoice']) {
    const b = button(page, name);
    const [scroll, client] = await b.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll, name).toBeLessThanOrEqual(client);
  }
  await button(page, 'Start a new invoice').click();
  await expect(heading(page, 'Upload your invoice')).toBeVisible();
});

test('buttons on the final amount screen keep their labels on one line when there is room', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'phones stack the buttons full width');
  await signIn(page);
  await upload(page);
  await readAmounts(page);
  await button(page, 'Calculate final amount').click();
  await debit(page).fill('10'); // an edit makes the Reset button appear too: four buttons
  await expect(button(page, 'Reset to what was found')).toBeVisible();
  for (const name of [
    'Copy result',
    'Reset to what was found',
    'Back to the invoice',
    'Start a new invoice',
  ]) {
    const box = await button(page, name).boundingBox();
    expect(box.height, `${name} has wrapped onto several lines`).toBeLessThan(60);
  }
  await expectNoSideScroll(page);
});
