// Central place for environment configuration. Providers (SMS, vision) read
// their own settings from here so nothing else touches process.env directly.
export function loadConfig(env = process.env) {
  const anthropicKey = env.ANTHROPIC_API_KEY || '';
  return {
    port: Number(env.PORT) || 4000,
    sms: {
      provider: env.SMS_PROVIDER || 'console',
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID || '',
        authToken: env.TWILIO_AUTH_TOKEN || '',
        fromNumber: env.TWILIO_FROM_NUMBER || '',
      },
    },
    vision: {
      provider: env.VISION_PROVIDER || (anthropicKey ? 'claude' : 'mock'),
      anthropicKey,
      model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    },
  };
}
