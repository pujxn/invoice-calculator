import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { normalizePhone } from '../src/auth/phone.js';

// Starts the app on a random port with a recording fake SMS provider and a fake clock.
// Sign-in is only for superadmins and added agents. Most tests are about something else, so by
// default any number they ask for a code for is first added as an agent. `autoRegister: false`
// turns that off, to test the real rule.
export async function startTestApp({
  env = {},
  sms,
  vision,
  visionMethods,
  prepare,
  autoRegister = true,
} = {}) {
  const clock = { t: 1_700_000_000_000 };
  const sent = [];
  const fakeSms = sms || {
    name: 'fake',
    async send(to, body) {
      sent.push({ to, body, code: /\b(\d{6})\b/.exec(body)?.[1] });
    },
  };
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'invoice-uploads-'));
  const dataDir = await mkdtemp(path.join(tmpdir(), 'ledgerly-data-'));
  const config = loadConfig({
    AUTH_SECRET: 'test-secret',
    UPLOAD_DIR: uploadDir,
    AGENTS_FILE: path.join(dataDir, 'agents.json'),
    HISTORY_FILE: path.join(dataDir, 'history.json'),
    ...env,
  });
  const app = createApp(config, {
    sms: fakeSms,
    now: () => clock.t,
    vision,
    visionMethods,
    prepare,
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  function register(phone) {
    if (!autoRegister || !phone || app.locals.store.getAgent(phone)) return;
    if (config.roles.superadmins.includes(phone)) return;
    app.locals.store.saveAgent({ phone, name: 'Agent' });
  }

  async function call(method, path, { body, token, headers } = {}) {
    if (/^\/api\/auth\/(request|verify)-otp$/.test(path) && body && typeof body === 'object') {
      register(normalizePhone(body.phone));
    }
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  }

  // Signs a phone number in and returns its session token. A number that is not yet a superadmin
  // or an agent is first added as an agent (named "Agent"), so most tests need no set-up.
  async function signIn(phone = '+447700900123') {
    register(phone);
    await call('POST', '/api/auth/request-otp', { body: { phone } });
    const code = sent.filter((m) => m.to === phone).at(-1).code;
    const res = await call('POST', '/api/auth/verify-otp', { body: { phone, code } });
    clock.t += 31_000; // clear the resend wait so the same number can sign in again
    return res.body.token;
  }

  // Posts a multipart form with one file part. Returns { status, headers, body }.
  async function upload(token, data, { field = 'image', filename = 'invoice.jpg', type } = {}) {
    const form = new FormData();
    if (data !== null) form.append(field, new Blob([data], { type }), filename);
    const res = await fetch(`${base}/api/invoices`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  }

  // Fetches raw bytes (for the image endpoint).
  async function fetchRaw(path, token) {
    const res = await fetch(base + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return {
      status: res.status,
      headers: res.headers,
      bytes: Buffer.from(await res.arrayBuffer()),
    };
  }

  // The default demo superadmin (or the first SUPERADMIN_PHONES number) signs in.
  const signInSuperadmin = () => signIn(config.roles.superadmins[0]);

  return {
    app,
    config,
    store: app.locals.store,
    history: app.locals.history,
    uploadDir,
    dataDir,
    signInSuperadmin,
    signIn,
    upload,
    fetchRaw,
    base,
    sent,
    clock,
    call,
    lastCode: () => sent.at(-1)?.code,
    advance: (ms) => (clock.t += ms),
    close: async () => {
      server.close();
      server.closeAllConnections?.();
      await app.locals.close?.();
      await rm(uploadDir, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
