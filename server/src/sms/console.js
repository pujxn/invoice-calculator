// Mock SMS provider: prints the message to the server log. No credentials needed.
export function createConsoleSms(log = console.log) {
  return {
    name: 'console',
    async send(to, body) {
      log(`[sms:console] to ${to}: ${body}`);
    },
  };
}
