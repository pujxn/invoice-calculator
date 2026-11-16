import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { latestCode, requestCodeFor, shot, uniquePhone } from './helpers.js';

// Every spec runs on a phone, a small phone and a desktop window (see playwright.config.js),
// so these checks cover the branding at all three sizes, in light and dark.
async function signIn(page) {
  const phone = uniquePhone();
  await page.goto('/login');
  await requestCodeFor(page, phone);
  await page.getByLabel('6-digit code').fill(await latestCode(phone));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as ${phone}`)).toBeVisible();
  return phone;
}

const wcag = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    const logoFile = scheme === 'dark' ? 'logo-dark.svg' : 'logo.svg';

    test('login screen is branded', async ({ page }) => {
      await page.goto('/login');
      await expect(page).toHaveTitle('Sign in · Ledgerly');
      const logo = page.getByRole('img', { name: 'Ledgerly' });
      await expect(logo).toBeVisible();
      // The picture element picks the variant matching the colour scheme, and it loads.
      await expect
        .poll(() => logo.evaluate((img) => img.currentSrc))
        .toMatch(new RegExp(`/brand/${logoFile}$`));
      expect(await logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByText('Read the invoice. See the balance.')).toBeVisible();
      await expect(page.getByText('Invoice Calculator')).toHaveCount(0);
      await shot(page, `branding-login-${scheme}`);
    });

    test('login and code steps have no accessibility violations', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      expect((await wcag(page)).violations).toEqual([]);

      await requestCodeFor(page, uniquePhone());
      await expect(page.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      expect((await wcag(page)).violations).toEqual([]);
      await shot(page, `branding-code-${scheme}`);
    });

    test('signed-in header shows the logo, fits the screen and signs out', async ({ page }) => {
      await signIn(page);
      const header = page.getByRole('banner');
      await expect(header.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Ledgerly home' })).toHaveAttribute(
        'href',
        '/',
      );
      await expect(page).toHaveTitle('Ledgerly');

      // The header never pushes the page sideways, even at 320px.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      const signOut = await header.getByRole('button', { name: 'Sign out' }).boundingBox();
      expect(signOut.x + signOut.width).toBeLessThanOrEqual(clientWidth);

      expect((await wcag(page)).violations).toEqual([]);
      await shot(page, `branding-home-${scheme}`);

      await header.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);
    });

    test('primary button text meets AA contrast and focus ring is visible', async ({ page }) => {
      await page.goto('/login');
      const phoneInput = page.getByLabel('Mobile number');
      await phoneInput.fill('+44 7700 900123');
      const button = page.getByRole('button', { name: 'Send code' });
      await expect(button).toBeEnabled();
      const ratio = await button.evaluate((el) => {
        const lum = (rgb) => {
          const [r, g, b] = rgb
            .match(/\d+/g)
            .slice(0, 3)
            .map((n) => {
              const c = Number(n) / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const s = getComputedStyle(el);
        const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      await phoneInput.focus();
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    });
  });
}

const PALETTE = {
  light: { primary: 'rgb(194, 24, 91)', bg: 'rgb(255, 247, 250)', accent: 'rgb(255, 200, 61)' },
  dark: { primary: 'rgb(255, 143, 184)', bg: 'rgb(28, 15, 22)', accent: 'rgb(255, 210, 94)' },
};
for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} pink palette`, () => {
    test.use({ colorScheme: scheme });
    const want = PALETTE[scheme];

    test('buttons and page use the pink palette', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Mobile number').fill('+44 7700 900123');
      const button = page.getByRole('button', { name: 'Send code' });
      expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        want.primary,
      );
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
        want.bg,
      );
    });

    test('"code sent" notice is green and the header has a yellow rule', async ({ page }) => {
      await page.goto('/login');
      const phone = uniquePhone();
      await requestCodeFor(page, phone);
      const notice = page.getByRole('status');
      await expect(notice).toContainText('We sent a code to');
      const [r, g, b] = (await notice.evaluate((el) => getComputedStyle(el).backgroundColor))
        .match(/\d+/g)
        .map(Number);
      expect(g).toBeGreaterThan(r); // green-tinted
      expect(g).toBeGreaterThan(b);
      await shot(page, `pink-code-sent-${scheme}`);

      await page.getByLabel('6-digit code').fill(await latestCode(phone));
      await page.getByRole('button', { name: 'Sign in' }).click();
      const header = page.getByRole('banner');
      await expect(header).toBeVisible();
      expect(await header.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(
        want.accent,
      );
    });
  });
}

test('brand assets and manifest are served', async ({ request }) => {
  for (const f of [
    'logo.svg',
    'logo-dark.svg',
    'logo-mark.svg',
    'logo-mark-dark.svg',
    'favicon.svg',
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
  ]) {
    expect((await request.get(`/brand/${f}`)).status(), f).toBe(200);
  }
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toBe('Ledgerly');
});

test('page declares the favicon, theme colour and manifest', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/brand/favicon.svg',
  );
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#c2185b',
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
});
