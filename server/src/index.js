import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
createApp(config).listen(config.port, () => {
  console.log(
    `API listening on http://localhost:${config.port} ` +
      `(sms: ${config.sms.provider}, vision: ${config.vision.provider})`,
  );
});
