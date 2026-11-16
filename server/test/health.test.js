import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

test('loadConfig defaults to console SMS and mock vision with no env', () => {
  const config = loadConfig({});
  assert.equal(config.port, 4000);
  assert.equal(config.sms.provider, 'console');
  assert.equal(config.vision.provider, 'mock');
  assert.equal(config.vision.model, 'claude-opus-5-5');
});

test('loadConfig picks claude vision when an API key is set', () => {
  assert.equal(loadConfig({ ANTHROPIC_API_KEY: 'k' }).vision.provider, 'claude');
  assert.equal(
    loadConfig({ ANTHROPIC_API_KEY: 'k', VISION_PROVIDER: 'mock' }).vision.provider,
    'mock',
  );
});

test('GET /api/health reports ok and providers', async () => {
  const server = createApp(loadConfig({})).listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: true,
      providers: { sms: 'console', vision: 'mock' },
    });
  } finally {
    server.close();
  }
});
