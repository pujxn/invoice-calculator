// The superadmin numbers the UI-test servers accept (SUPERADMIN_PHONES in playwright.config.js).
// Several, because each number may be sent only 5 codes an hour: tests take a fresh one whenever
// they need to sign in as superadmin.
export const SUPERADMINS = Array.from(
  { length: 60 },
  (_, i) => `+9190000000${String(i).padStart(2, '0')}`,
);
