import { configWarnings, loadConfig } from './config.js';
import { createApp } from './app.js';

// Load server/.env if present (real environment variables still win).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const config = loadConfig();
for (const warning of configWarnings(config)) console.warn(`WARNING: ${warning}`);
createApp(config).listen(config.port, () => {
  console.log(
    `API listening on http://localhost:${config.port} ` +
      `(sms: ${config.sms.provider}, vision: ${config.vision.provider})`,
  );
});
