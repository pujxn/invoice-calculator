// Pure helpers for scripts/phone.mjs (`npm run dev:phone`), kept apart so they can be tested.
import net from 'node:net';

// True when nothing is listening on the port, on any of the ways another program may have bound
// it (all addresses, IPv4 localhost, IPv6 localhost). Other errors (for example IPv6 switched
// off) do not count as "busy".
export async function portIsFree(port, hosts = ['0.0.0.0', '127.0.0.1', '::1']) {
  for (const host of hosts) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', (err) => resolve(err.code !== 'EADDRINUSE' && err.code !== 'EACCES'));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, host);
    });
    if (!free) return false;
  }
  return true;
}

// The first free port at or above `start` (looks at the next 50), or null.
export async function findFreePort(start, isFree = portIsFree, skip = []) {
  for (let port = start; port < start + 50; port++) {
    if (skip.includes(port)) continue;
    if (await isFree(port)) return port;
  }
  return null;
}

// The words printed before the apps start. `ip` may be undefined when the computer has no
// network address.
export function phoneBanner({ ip, webPort, apiPort, superadmin }) {
  const lines = [''];
  if (!ip) {
    lines.push(
      'Could not find this computer’s Wi-Fi address. Connect to Wi-Fi (the same one as the phone)',
      'and run this again. Until then you can still use http://localhost:' + webPort,
    );
    return lines.join('\n');
  }
  lines.push(
    '================ Ledgerly on your phone ================',
    '',
    `  On the phone (same Wi-Fi as this computer), open:  http://${ip}:${webPort}`,
    `  On this computer:                                  http://localhost:${webPort}`,
    '',
    `  Sign in as superadmin with ${superadmin}.`,
    '  The sign-in code is printed in THIS window (look for "Your Ledgerly code is ...").',
    '  Press Ctrl+C here to stop.',
  );
  if (apiPort !== 4000 || webPort !== 5173) {
    lines.push(
      '',
      `  (Port 4000 or 5173 was busy, so this run uses ${webPort} for the page and ${apiPort} for the API.)`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
