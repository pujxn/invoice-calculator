// Starts Ledgerly so a phone on the same Wi-Fi can open it: `npm run dev:phone`.
//
// Like `npm run dev`, but the web page listens on the Wi-Fi as well as on this computer, it picks
// free ports if 4000 or 5173 are taken by another program, and it prints the address to type
// into the phone (with a QR code to scan). The phone only talks to the web page's port: the page
// passes /api calls on to the API on this computer.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { lanAddresses } from './native-lib.mjs';
import { findFreePort, phoneBanner } from './phone-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const apiPort = await findFreePort(4000);
const webPort = await findFreePort(5173);
if (!apiPort || !webPort) {
  console.error('Could not find a free port. Close other programs that use ports 4000 and 5173.');
  process.exit(1);
}
const [ip] = lanAddresses();

console.log(phoneBanner({ ip, webPort, apiPort, superadmin: '+91 99999 00000' }));
if (ip) {
  try {
    // A QR code the phone's camera app can scan, so nothing has to be typed.
    require('qrcode-terminal').generate(`http://${ip}:${webPort}`, { small: true });
    console.log('');
  } catch {
    // The QR code is a nicety; the address above is enough.
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(
  npm,
  [
    'exec',
    '--',
    'concurrently',
    '-n',
    'server,client',
    '-c',
    'blue,green',
    'npm run dev -w server',
    `npm run dev -w client -- --host --port ${webPort} --strictPort`,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, PORT: String(apiPort), API_URL: `http://localhost:${apiPort}` },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
