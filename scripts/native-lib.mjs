// Pure helpers for scripts/native.mjs (the iOS and Android build commands), kept apart so they
// can be tested without running a build.
import { networkInterfaces } from 'node:os';

const PRIVATE = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
// Adapters made by VPNs, containers and virtual machines: a phone cannot reach those addresses.
const VIRTUAL =
  /^(docker|br-|veth|virbr|vmnet|vboxnet|utun|tun|tap|lo|vEthernet|zt|tailscale|awdl|llw|bridge)/i;

// Addresses of this computer that a phone on the same Wi-Fi could use, best guess first.
export function lanAddresses(interfaces = networkInterfaces()) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const item of list || []) {
      // Node reports the family as 'IPv4' (older versions: 4).
      if ((item.family !== 'IPv4' && item.family !== 4) || item.internal) continue;
      if (item.address.startsWith('169.254.')) continue; // no network: self-assigned address
      const rank =
        (PRIVATE.some((re) => re.test(item.address)) ? 0 : 2) + (VIRTUAL.test(name) ? 1 : 0);
      found.push({ address: item.address, rank });
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.address);
}

// "--production", "--api <url>" or "--api=<url>", plus the words left over.
export function parseArgs(argv) {
  const out = { production: false, api: '', positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--production') out.production = true;
    else if (arg === '--api') out.api = argv[++i] ?? '';
    else if (arg.startsWith('--api=')) out.api = arg.slice('--api='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}.`);
    else out.positional.push(arg);
  }
  return out;
}

// Works out the server address baked into the app.
//  - You gave one (--api or LEDGERLY_API_URL): it is used. A production build must be https.
//  - Development, none given: this computer's Wi-Fi address and the API port, which both an
//    emulator and a phone on the same network can reach ("localhost" would be the phone itself).
//  - Production, none given: an error. A store build must never point at a development computer.
export function resolveApiUrl({
  production = false,
  api = '',
  env = process.env,
  interfaces = networkInterfaces(),
} = {}) {
  const given = (api || env.LEDGERLY_API_URL || '').trim();
  if (given) {
    let url;
    try {
      url = new URL(given);
    } catch {
      throw new Error(
        `"${given}" is not a web address. Use something like https://api.example.com`,
      );
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`The server address must start with http:// or https://, not "${given}".`);
    }
    if (url.search || url.hash) throw new Error('The server address must not contain ? or #.');
    if (production && url.protocol !== 'https:') {
      throw new Error(`A production app must use https, but the address is "${given}".`);
    }
    return { url: given.replace(/\/+$/, ''), source: api ? '--api' : 'LEDGERLY_API_URL' };
  }
  if (production) {
    throw new Error(
      'A production build needs the address of your live server. ' +
        'Run: npm run native:sync:production -- --api https://your-server.example.com',
    );
  }
  const [ip] = lanAddresses(interfaces);
  if (!ip) {
    throw new Error(
      'Could not find this computer’s Wi-Fi address. Connect to a network, or give the address: ' +
        'npm run native:sync -- --api http://192.168.1.20:4000',
    );
  }
  const port = Number(env.PORT) || 4000;
  return { url: `http://${ip}:${port}`, source: 'this computer’s network address' };
}

// Environment variables for the web build and for `cap sync`.
export function nativeEnv({ production, apiUrl }) {
  return {
    VITE_API_BASE_URL: apiUrl,
    LEDGERLY_NATIVE_ENV: production ? 'production' : 'development',
  };
}

// iOS apps can only be built on a Mac. Returns an error message, or null when fine.
export function platformProblem(platform, hostPlatform = process.platform) {
  if (platform !== 'ios' && platform !== 'android') {
    return `Unknown platform "${platform ?? ''}". Use android or ios.`;
  }
  if (platform === 'ios' && hostPlatform !== 'darwin') {
    return 'iOS apps can only be built on a Mac with Xcode installed.';
  }
  return null;
}

// Asks the API's health check whether it is running. Resolves true or false, never throws.
export async function serverIsUp(apiUrl, fetchFn = fetch, timeoutMs = 2500) {
  try {
    const res = await fetchFn(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
