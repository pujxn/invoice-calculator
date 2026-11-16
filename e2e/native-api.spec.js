import { expect, test } from '@playwright/test';
import { signIn } from './helpers.js';

// The iOS and Android apps load their pages from the phone and call the API on another address,
// so a real browser must be allowed to make those cross-origin calls. This page (localhost:5273)
// is not the API's address (localhost:4100), which makes it a stand-in for the app: the server
// is started with this page's origin in CORS_ORIGINS. Chromium enforces CORS exactly as the
// Android webview does.
const API = 'http://localhost:4100';

async function token(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('invoice-calculator.session')).token);
}

test('a page on another origin can call the API with the bearer token', async ({ page }) => {
  await signIn(page);
  const result = await page.evaluate(
    async ({ api, tok }) => {
      // Authorization is not a "simple" header, so the browser sends a preflight first.
      const me = await fetch(`${api}/api/auth/me`, { headers: { Authorization: `Bearer ${tok}` } });
      const calc = await fetch(`${api}/api/invoices/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ debit: '1250.50', credit: '400.00' }),
      });
      return { me: me.status, calc: calc.status, body: await calc.json() };
    },
    { api: API, tok: await token(page) },
  );
  expect(result.me).toBe(200);
  expect(result.calc).toBe(200);
  expect(result.body).toMatchObject({ net: '850.50' });
});

test('a picture upload and its removal work cross-origin too', async ({ page }) => {
  await signIn(page);
  const tok = await token(page);
  const result = await page.evaluate(
    async ({ api, tok }) => {
      // A minimal PNG signature plus padding is enough: the server decides by the file's bytes.
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0,
        0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0x0d, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0, 5, 0xfe, 2, 0xfe, 0xa7, 0x35, 0x81, 0x84,
        0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const form = new FormData();
      form.append('image', new File([png], 'x.png', { type: 'image/png' }));
      const up = await fetch(`${api}/api/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      const meta = await up.json();
      const img = await fetch(`${api}/api/invoices/${meta.id}/image`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      // DELETE is not a simple method either.
      const del = await fetch(`${api}/api/invoices/${meta.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      return { up: up.status, img: img.status, del: del.status };
    },
    { api: API, tok },
  );
  expect(result).toEqual({ up: 201, img: 200, del: 200 });
});

test('a page from an origin that is not allowed is blocked by the browser', async ({ page }) => {
  await signIn(page);
  const tok = await token(page);
  // about:blank has the opaque origin "null", which the server does not list.
  await page.goto('about:blank');
  const outcome = await page.evaluate(
    async ({ api, tok }) => {
      try {
        const res = await fetch(`${api}/api/auth/me`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        return `answered ${res.status}`;
      } catch (err) {
        return `blocked: ${err.name}`;
      }
    },
    { api: API, tok },
  );
  expect(outcome).toBe('blocked: TypeError');
});

test('the web app itself still uses same-origin /api paths', async ({ page }) => {
  const urls = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) urls.push(new URL(req.url()).origin);
  });
  await signIn(page);
  expect(urls.length).toBeGreaterThan(0);
  // Every call goes to the page's own origin (the Vite proxy), never straight to the API port.
  expect(new Set(urls)).toEqual(new Set(['http://localhost:5273']));
});
