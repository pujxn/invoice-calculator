import express from 'express';

export function createApp(config) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      providers: { sms: config.sms.provider, vision: config.vision.provider },
    });
  });

  return app;
}
