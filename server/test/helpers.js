import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// Starts the app on a random port with a recording fake SMS provider and a fake clock.
export async function startTestApp({ env = {}, sms } = {}) {
  const clock = { t: 1_700_000_000_000 };
  const sent = [];
  const fakeSms = sms || {
    name: 'fake',
    async send(to, body) {
      sent.push({ to, body, code: /\b(\d{6})\b/.exec(body)?.[1] });
    },
  };
  const config = loadConfig({ AUTH_SECRET: 'test-secret', ...env });
  const app = createApp(config, { sms: fakeSms, now: () => clock.t });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { body, token, headers } = {}) {
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

  return {
    sent,
    clock,
    call,
    lastCode: () => sent.at(-1)?.code,
    advance: (ms) => (clock.t += ms),
    close: () => server.close(),
  };
}
