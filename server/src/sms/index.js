import { createConsoleSms } from './console.js';
import { createTwilioSms } from './twilio.js';

// Picks the SMS provider named by config.sms.provider. Fails fast on a bad setup.
export function createSmsProvider(smsConfig) {
  switch (smsConfig.provider) {
    case 'console':
      return createConsoleSms();
    case 'twilio':
      return createTwilioSms(smsConfig.twilio);
    default:
      throw new Error(`Unknown SMS_PROVIDER "${smsConfig.provider}" (use "console" or "twilio")`);
  }
}
