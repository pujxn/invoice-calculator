import { configWarnings, DEMO_SUPERADMIN, loadConfig } from './config.js';
import { createApp } from './app.js';

// Load server/.env if present (real environment variables still win).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const config = loadConfig();
for (const warning of configWarnings(config)) console.warn(`WARNING: ${warning}`);
if (config.roles.demoSuperadmin) {
  console.log(
    `No SUPERADMIN_PHONES set: for this local demo, sign in as superadmin with ${DEMO_SUPERADMIN}.`,
  );
}
createApp(config).listen(config.port, () => {
  console.log(
    `API listening on http://localhost:${config.port} ` +
      `(sms: ${config.sms.provider}, vision: ${config.vision.provider})`,
  );
});
