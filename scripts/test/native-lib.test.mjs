import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lanAddresses,
  nativeEnv,
  parseArgs,
  platformProblem,
  resolveApiUrl,
  serverIsUp,
} from '../native-lib.mjs';

const nic = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });

test('lanAddresses prefers Wi-Fi style addresses over VPN, container and link-local ones', () => {
  const found = lanAddresses({
    lo0: [nic('127.0.0.1', { internal: true })],
    docker0: [nic('172.17.0.1')],
    utun3: [nic('10.8.0.2')],
    en0: [nic('192.168.1.20'), { address: 'fe80::1', family: 'IPv6', internal: false }],
    en5: [nic('169.254.12.9')],
    eth9: [nic('8.8.4.4')],
  });
  // 192.168.x on a real adapter first; private addresses on VPN or container adapters next;
  // a public address last. Loopback and 169.254.x (no network) never appear.
  assert.deepEqual(found, ['192.168.1.20', '172.17.0.1', '10.8.0.2', '8.8.4.4']);
});

test('lanAddresses accepts numeric families and returns nothing when offline', () => {
  assert.deepEqual(lanAddresses({ en0: [{ address: '10.0.0.5', family: 4, internal: false }] }), [
    '10.0.0.5',
  ]);
  assert.deepEqual(lanAddresses({ lo: [nic('127.0.0.1', { internal: true })] }), []);
  assert.deepEqual(lanAddresses({}), []);
});

test('parseArgs reads --production and --api in both spellings', () => {
  assert.deepEqual(parseArgs([]), { production: false, api: '', positional: [] });
  assert.deepEqual(parseArgs(['--production', '--api', 'https://a.example']), {
    production: true,
    api: 'https://a.example',
    positional: [],
  });
  assert.equal(parseArgs(['--api=https://b.example']).api, 'https://b.example');
  assert.deepEqual(parseArgs(['android']).positional, ['android']);
  assert.throws(() => parseArgs(['--nope']), /Unknown option --nope/);
});

test('development: uses this computer’s address and the API port', () => {
  const interfaces = { en0: [nic('192.168.1.20')] };
  assert.deepEqual(resolveApiUrl({ env: {}, interfaces }), {
    url: 'http://192.168.1.20:4000',
    source: 'this computer’s network address',
  });
  assert.equal(
    resolveApiUrl({ env: { PORT: '4100' }, interfaces }).url,
    'http://192.168.1.20:4100',
  );
});

test('development: an explicit address wins, from the flag first, then the environment', () => {
  const interfaces = { en0: [nic('192.168.1.20')] };
  const flag = resolveApiUrl({
    api: 'http://10.0.0.9:4000/',
    env: { LEDGERLY_API_URL: 'http://x' },
    interfaces,
  });
  assert.deepEqual(flag, { url: 'http://10.0.0.9:4000', source: '--api' });
  const fromEnv = resolveApiUrl({
    env: { LEDGERLY_API_URL: ' https://api.example.com/v1/ ' },
    interfaces,
  });
  assert.deepEqual(fromEnv, { url: 'https://api.example.com/v1', source: 'LEDGERLY_API_URL' });
});

test('development: no network and no address is a clear error', () => {
  assert.throws(() => resolveApiUrl({ env: {}, interfaces: {} }), /Wi-Fi address/);
});

test('production: needs an https address and never guesses one', () => {
  const interfaces = { en0: [nic('192.168.1.20')] };
  assert.throws(() => resolveApiUrl({ production: true, env: {}, interfaces }), /live server/);
  assert.throws(
    () => resolveApiUrl({ production: true, api: 'http://api.example.com', env: {}, interfaces }),
    /must use https/,
  );
  assert.equal(
    resolveApiUrl({ production: true, api: 'https://api.example.com', env: {}, interfaces }).url,
    'https://api.example.com',
  );
});

test('bad addresses are refused with a helpful message', () => {
  for (const bad of [
    'not a url',
    'ftp://example.com',
    'https://example.com/?a=1',
    'https://example.com/#x',
  ]) {
    assert.throws(() => resolveApiUrl({ api: bad, env: {}, interfaces: {} }), Error, bad);
  }
});

test('nativeEnv marks production and development builds', () => {
  assert.deepEqual(nativeEnv({ production: true, apiUrl: 'https://a.example' }), {
    VITE_API_BASE_URL: 'https://a.example',
    LEDGERLY_NATIVE_ENV: 'production',
  });
  assert.equal(
    nativeEnv({ production: false, apiUrl: 'http://x' }).LEDGERLY_NATIVE_ENV,
    'development',
  );
});

test('platformProblem: iOS needs a Mac, unknown platforms are rejected', () => {
  assert.equal(platformProblem('android', 'linux'), null);
  assert.equal(platformProblem('ios', 'darwin'), null);
  assert.match(platformProblem('ios', 'linux'), /Mac/);
  assert.match(platformProblem('windows', 'darwin'), /android or ios/);
  assert.match(platformProblem(undefined, 'darwin'), /android or ios/);
});

test('serverIsUp is true for a healthy answer and false for anything else, without throwing', async () => {
  const seen = [];
  assert.equal(
    await serverIsUp('http://h:4000', async (url) => (seen.push(url), { ok: true })),
    true,
  );
  assert.deepEqual(seen, ['http://h:4000/api/health']);
  assert.equal(await serverIsUp('http://h', async () => ({ ok: false })), false);
  assert.equal(
    await serverIsUp('http://h', async () => {
      throw new Error('down');
    }),
    false,
  );
});
