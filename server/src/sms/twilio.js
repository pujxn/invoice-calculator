// Twilio SMS provider using the REST API directly (no SDK dependency).
export function createTwilioSms({ accountSid, authToken, fromNumber }, fetchImpl = fetch) {
  const missing = Object.entries({
    TWILIO_ACCOUNT_SID: accountSid,
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_FROM_NUMBER: fromNumber,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`SMS_PROVIDER=twilio requires ${missing.join(', ')}`);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const authorization = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return {
    name: 'twilio',
    async send(to, body) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
      });
      if (!res.ok) {
        // Twilio error bodies carry a code and message but never our credentials.
        const detail = await res.text().catch(() => '');
        throw new Error(`Twilio responded ${res.status}: ${detail.slice(0, 200)}`);
      }
    },
  };
}
