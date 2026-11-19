import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  expectNoSideScroll,
  expectTouchFriendly,
  freshSuperadmin,
  latestCode,
  registerAgent,
  requestCodeFor,
  shot,
  uniquePhone,
} from './helpers.js';

const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));

// Signs a number in through the real login page, whatever its role, and waits for the code screen
// to finish. `register: false` leaves the number as it is (a superadmin, or one that was added).
async function signInAs(page, phone) {
  await page.goto('/login');
  await requestCodeFor(page, phone, { register: false });
  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// Types a number and presses Send code, without expecting the code screen to appear.
async function sendCode(page, phone) {
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
}

async function signInSuperadmin(page) {
  await signInAs(page, freshSuperadmin());
  await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
}

async function signInAgent(page, phone, name) {
  await signInAs(page, phone);
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

// From the final amount, back to the upload screen for the next invoice.
async function startNewInvoice(page) {
  await page.getByRole('button', { name: 'Start a new invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
}

// On the upload screen: reads the sample picture with the demo reader, types the two amounts and
// saves the invoice; ends on the final amount.
async function saveInvoice(page, { debit, credit }) {
  await page.getByTestId('file-input').setInputFiles(PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Read amounts' }).click();
  await expect(page.getByRole('heading', { name: 'Amounts we found' })).toBeVisible();
  await page.getByLabel(/^Debit/).fill(debit);
  await page.getByLabel(/^Credit/).fill(credit);
  await page.getByRole('button', { name: 'Calculate final amount' }).click();
  await expect(page.getByRole('heading', { name: 'Final amount' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to my list' }).click();
  await expect(page.getByTestId('saved-note')).toContainText('Saved to your list.');
}

const net = (page) => page.getByTestId('totals-net');

test('superadmin adds an agent, the agent saves invoices, and the superadmin sees the totals', async ({
  page,
}) => {
  const phone = uniquePhone();

  // Superadmin adds the agent.
  await signInSuperadmin(page);
  await expect(page.getByRole('heading', { name: 'Add an agent' })).toBeVisible();
  await shot(page, 'roles-01-admin-empty');
  await page.getByLabel('Name').fill('Asha Rao');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Add agent' }).click();
  await expect(page.getByText('Asha Rao was added.')).toBeVisible();
  const row = page.getByTestId('agent').filter({ hasText: phone });
  await expect(row).toContainText('Asha Rao');
  await expect(row).toContainText('₹0.00');

  // The same number twice is refused with a reason.
  await page.getByLabel('Name').fill('Asha again');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Add agent' }).click();
  await expect(page.getByRole('alert')).toContainText('already an agent (Asha Rao)');
  await signOut(page);

  // The agent signs in, sees only agent things, and saves two invoices.
  await signInAgent(page, phone, 'Asha Rao');
  await expect(page.getByRole('link', { name: 'Agents' })).toHaveCount(0);
  await saveInvoice(page, { debit: '50000', credit: '10000' });
  await shot(page, 'roles-02-saved');
  await startNewInvoice(page);
  await saveInvoice(page, { debit: '', credit: '70000.25' });
  await page.getByRole('link', { name: 'My list', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My list' })).toBeVisible();
  await expect(page.getByTestId('totals-debit')).toHaveText('₹50,000.00');
  await expect(page.getByTestId('totals-credit')).toHaveText('₹80,000.25');
  await expect(net(page)).toContainText('Net Credit');
  await expect(net(page)).toContainText('₹30,000.25');
  await expect(page.getByTestId('entry')).toHaveCount(2);
  await expect(page.getByTestId('entry').first()).toContainText('Net Credit ₹70,000.25');
  await shot(page, 'roles-03-my-list');
  await signOut(page);

  // The superadmin sees the agent's figures, the overall total and the agent's list.
  await signInSuperadmin(page);
  const agentRow = page.getByTestId('agent').filter({ hasText: phone });
  await expect(agentRow).toContainText('₹50,000.00');
  await expect(agentRow).toContainText('₹80,000.25');
  await expect(agentRow).toContainText('Net Credit');
  await expect(net(page).first()).toBeVisible(); // the overall total
  await shot(page, 'roles-04-admin-totals');
  await agentRow.getByRole('link', { name: 'View list' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asha Rao' })).toBeVisible();
  await expect(page.getByTestId('entry')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await shot(page, 'roles-05-admin-agent-list');
  await page.getByRole('link', { name: '← All agents' }).click();

  // Removing the agent signs them out for good, and their list still counts.
  await page
    .getByTestId('agent')
    .filter({ hasText: phone })
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('Asha Rao was removed.')).toBeVisible();
  await expect(page.getByTestId('agent').filter({ hasText: phone })).toHaveCount(0);
  const gone = page.getByTestId('removed-agent').filter({ hasText: phone });
  await expect(gone).toContainText('Asha Rao');
  await expect(gone).toContainText('₹80,000.25'); // the list is kept and still counted
  await shot(page, 'roles-06-admin-removed');
  await signOut(page);

  await page.goto('/login');
  await sendCode(page, phone);
  await expect(page.getByRole('alert')).toContainText('not registered');
});

test('a number nobody added sees a clear message and gets no code screen', async ({ page }) => {
  await page.goto('/login');
  await sendCode(page, uniquePhone());
  await expect(page.getByRole('alert')).toContainText('not registered with Ledgerly');
  await expect(page.getByLabel('6-digit code')).toHaveCount(0);
  await shot(page, 'roles-07-not-registered');
});

test('each role stays in its own pages', async ({ page }) => {
  const phone = uniquePhone();
  await registerAgent(phone, 'Meera');
  await signInAgent(page, phone, 'Meera');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Meera' })).toBeVisible();
  await signOut(page);

  await signInSuperadmin(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/list');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'My list', exact: true })).toHaveCount(0);
});

test('an agent can delete a saved invoice and the total follows', async ({ page }) => {
  const phone = uniquePhone();
  await registerAgent(phone, 'Ravi');
  await signInAgent(page, phone, 'Ravi');
  await saveInvoice(page, { debit: '1250.50', credit: '400' });
  await startNewInvoice(page);
  await saveInvoice(page, { debit: '12.345', credit: '' });
  await page.getByRole('link', { name: 'My list', exact: true }).click();
  await expect(page.getByTestId('totals-debit')).toHaveText('₹1,262.845'); // every decimal is kept
  await page.getByTestId('entry').first().getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByTestId('entry')).toHaveCount(2);
  await page.getByTestId('entry').first().getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByTestId('entry')).toHaveCount(1);
  await expect(page.getByTestId('totals-debit')).toHaveText('₹1,250.50');
  // A reload shows the same list: it is kept on the server, not in the browser.
  await page.reload();
  await expect(page.getByTestId('entry')).toHaveCount(1);
});

test('an empty list tells the agent what to do', async ({ page }) => {
  const phone = uniquePhone();
  await registerAgent(phone, 'Neha');
  await signInAgent(page, phone, 'Neha');
  await page.getByRole('link', { name: 'My list', exact: true }).click();
  await expect(page.getByText('You have not saved any invoices yet.')).toBeVisible();
  await expect(net(page)).toContainText('Nothing yet');
});

test('the new screens fit the screen, are touch friendly and pass the accessibility checks', async ({
  page,
}) => {
  const phone = uniquePhone();
  await signInSuperadmin(page);
  await page.getByLabel('Name').fill('Asha Rao');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Add agent' }).click();
  await expect(page.getByTestId('agent').filter({ hasText: phone })).toHaveCount(1);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByTestId('agent')
    .filter({ hasText: phone })
    .getByRole('link', { name: 'View list' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asha Rao' })).toBeVisible();
  await expectNoSideScroll(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await signOut(page);

  await signInAgent(page, phone, 'Asha Rao');
  await saveInvoice(page, { debit: '12,34,567.891', credit: '500' });
  await expectNoSideScroll(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'My list', exact: true }).click();
  await expect(page.getByTestId('entry')).toHaveCount(1);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
