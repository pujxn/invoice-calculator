import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { findFreePort, phoneBanner, portIsFree } from '../phone-lib.mjs';

test('findFreePort skips busy ports and gives up after 50', async () => {
  assert.equal(await findFreePort(5173, async (p) => p >= 5175), 5175);
  assert.equal(await findFreePort(5173, async () => true), 5173);
  assert.equal(await findFreePort(5173, async () => false), null);
});

test('findFreePort can skip a port another service has picked', async () => {
  assert.equal(await findFreePort(4000, async () => true, [4000]), 4001);
});

test('portIsFree notices a program already listening', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  assert.equal(await portIsFree(port), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await portIsFree(port), true);
});

test('phoneBanner shows the phone address, sign-in number and a note when ports moved', () => {
  const text = phoneBanner({
    ip: '192.168.1.20',
    webPort: 5174,
    apiPort: 4001,
    superadmin: '+91 1',
  });
  assert.match(text, /http:\/\/192\.168\.1\.20:5174/);
  assert.match(text, /http:\/\/localhost:5174/);
  assert.match(text, /\+91 1/);
  assert.match(text, /busy/);
  const plain = phoneBanner({ ip: '10.0.0.5', webPort: 5173, apiPort: 4000, superadmin: '+91 1' });
  assert.doesNotMatch(plain, /busy/);
});

test('phoneBanner explains when there is no network address', () => {
  const text = phoneBanner({ ip: undefined, webPort: 5173, apiPort: 4000, superadmin: '+91 1' });
  assert.match(text, /Wi-Fi address/);
  assert.match(text, /localhost:5173/);
});
