<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-dark.svg" />
    <img src="client/public/brand/logo.svg" alt="Ledgerly" height="64" />
  </picture>
</p>

# Ledgerly

Take a photo of an invoice. Ledgerly reads the **Debit** and **Credit** amounts with AI, lets you check and correct them, and shows the **final amount** as a Net Debit, a Net Credit or Balanced. People sign in with a one-time code sent by SMS. It is one responsive web app that works on a phone and on a computer.

- Product spec (source of truth): [SPEC.md](SPEC.md), a snapshot of the [live spec doc](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs). Change the doc first, then update this file.
- Status: sign in, upload, AI reading, calculation and result screen all work. See the requirement table in SPEC.md.

## Quick start

You need [Node.js](https://nodejs.org) 20.12 or newer (check with `node -v`). Then, in a terminal in the project folder:

```
npm install
npm run dev
```

Open **http://localhost:5173**. To stop, press `Ctrl+C`.

Nothing else is needed. The app starts in **mock mode**: no real text message is sent (the sign-in code is printed in the terminal where `npm run dev` runs) and no real AI is called (the amounts are made-up demo numbers, always the same for the same picture).

### Try the whole thing (about 3 minutes)

1. **Sign in.** Type a number with its country code, for example `+44 7700 900123`, and press **Send code**. Look in the terminal for a line like `[sms:console] to +447700900123: Your Ledgerly code is 106950.` and type the 6 digits into the page.
2. **Upload.** Press **Choose file** and pick any JPEG, PNG, WebP or HEIC picture (a screenshot is fine). A preview appears. On a phone there is also **Take photo**.
3. **Read.** Press **Read amounts**. You see **Amounts we found**: a Debit box and a Credit box (both editable) and the lines found. In mock mode these are demo numbers. To type your own, press **Type the amounts instead** after uploading.
4. **Calculate.** Press **Calculate final amount**. You see **Net Debit**, **Net Credit** or **Balanced** in large type, with the working. Change either amount in the boxes below it and the result updates at once. **Copy result** copies one line you can paste.
5. **Go back and forward.** The browser's Back button (or **Back to the invoice**) returns to the amounts without losing your edits. Refreshing the page keeps your place.
6. **Start again or leave.** **Start a new invoice** returns to upload without signing in again. **Sign out** clears everything from the browser.

Things worth trying: a wrong code (4 tries left, then the code locks), a PDF instead of a picture, a picture over 10 MB, a HEIC photo, `12.345` in an amount box, both boxes empty, and Debit `0.30` with Credit `0.10` (exactly `0.20`).

### See it on a phone

Your computer and phone must be on the same Wi-Fi. Run `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. The second prints a `Network:` address such as `http://192.168.1.20:5173`; open it on the phone. The sign-in code still appears in the computer's terminal. On a computer you can also press F12 then Ctrl+Shift+M (Cmd+Shift+M on a Mac) for a phone-sized window, and switch your system to dark mode to see the dark theme.

### If something goes wrong

| What you see                          | What to do                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm install` or the app will not run | Check `node -v` is 20.12 or newer.                                                                  |
| "address already in use" (port 4000)  | Another program uses that port. Stop it, or set `PORT=4001` in `server/.env`.                       |
| The page loads but sign-in fails      | The API is not running. `npm run dev` starts both; look for `API listening` in the terminal.        |
| No sign-in code arrives               | In mock mode it is printed in the terminal running `npm run dev`, not sent by SMS.                  |
| Signed out after a restart            | Expected: sessions live in server memory. Sign in again.                                            |
| The UI tests cannot start a browser   | Run `npx playwright install chromium` once.                                                         |
| Pictures pile up in `server/uploads`  | They are deleted automatically after 24 hours, or as soon as they are read. Safe to delete by hand. |

## Use the real AI and real text messages (optional)

Settings live in `server/.env`. Create it once with `cp server/.env.example server/.env` (Windows: `copy server\.env.example server\.env`), edit it, and restart the app. Never commit it.

**Real AI** (costs a little per invoice): get a key at https://console.anthropic.com and set `ANTHROPIC_API_KEY=sk-ant-...`. The terminal then says `vision: claude`, and **Amounts we found** says "Read from your picture by AI." Remove the key (or set `VISION_PROVIDER=mock`) to go back to mock mode. The key stays on the server and is never sent to the browser. The tests never use it.

**Real SMS:** create a Twilio account and set `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. The server refuses to start if one is missing. A Twilio trial account can only text numbers you have verified in Twilio.

### Environment variables

With nothing set, one-time codes print to the server log and the AI is a mock.

| Variable                    | Default                               | Purpose                                                                                                        |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | `4000`                                | Port for the Node API                                                                                          |
| `NODE_ENV`                  | none                                  | Set to `production` on a real server: start-up then warns about mock SMS, mock AI and a missing `AUTH_SECRET`  |
| `TRUST_PROXY`               | `0`                                   | Number of proxies in front of the server (usually `1` behind a load balancer) so per-IP limits see the visitor |
| `SMS_PROVIDER`              | `console`                             | `console` prints codes to the log; `twilio` sends real SMS                                                     |
| `TWILIO_ACCOUNT_SID`        | none                                  | Twilio account, needed for `twilio`                                                                            |
| `TWILIO_AUTH_TOKEN`         | none                                  | Twilio secret, needed for `twilio`                                                                             |
| `TWILIO_FROM_NUMBER`        | none                                  | Sending number in E.164 format                                                                                 |
| `AUTH_SECRET`               | random per start                      | Key for hashing one-time codes; set a long random value so codes survive restarts                              |
| `AUTH_IP_REQUEST_LIMIT`     | `20`                                  | Code requests allowed per IP per 15 minutes                                                                    |
| `AUTH_IP_VERIFY_LIMIT`      | `40`                                  | Code checks allowed per IP per 15 minutes                                                                      |
| `UPLOAD_DIR`                | `server/uploads`                      | Folder where uploaded invoice pictures are kept                                                                |
| `UPLOAD_MAX_MB`             | `10`                                  | Largest picture accepted                                                                                       |
| `UPLOAD_TTL_HOURS`          | `24`                                  | Pictures are deleted after this long                                                                           |
| `UPLOAD_MAX_PER_USER`       | `50`                                  | Pictures one user can keep at once                                                                             |
| `VISION_PROVIDER`           | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                                                                      |
| `ANTHROPIC_API_KEY`         | none                                  | Key for Claude vision                                                                                          |
| `ANTHROPIC_MODEL`           | `claude-opus-5-5`                     | Claude model used for reading invoices                                                                         |
| `ANTHROPIC_EFFORT`          | `medium`                              | How hard the model thinks: `low` to `max`, or `none`                                                           |
| `ANTHROPIC_TIMEOUT_SECONDS` | `60`                                  | Give up on one AI call after this long                                                                         |
| `ANTHROPIC_FALLBACKS`       | none                                  | Set to `default` to let the API retry a declined request on another model                                      |
| `EXTRACT_PER_USER_PER_HOUR` | `30`                                  | Readings one user can start per hour (each costs money)                                                        |

All settings are read in one place, `server/src/config.js`.

## For developers

```
client/   React 18 + Vite web app (dev server :5173, proxies /api to :4000)
server/   Node + Express API (:4000)
shared/   Exact-decimal money maths used by both (@ledgerly/money)
e2e/      Playwright browser tests (phone, small phone, desktop)
SPEC.md   Product spec, source of truth
```

| Command                   | What it does                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Start API and web app together with reload                                                        |
| `npm run build`           | Production build of the web app (`client/dist`)                                                   |
| `npm start`               | Start the API only (it does not serve `client/dist`; hosting the built app is not set up yet)     |
| `npm test`                | Shared, server and web app tests (fast)                                                           |
| `npm run test:ui`         | Browser tests in a hidden browser: phone, small phone and desktop windows                         |
| `npm run test:ui:screens` | Same, and saves screenshots to `test-screenshots/` (or `SCREENSHOT_DIR`); git-ignored, not in PRs |
| `npm run lint`            | ESLint (`npm run format` fixes formatting with Prettier, `format:check` verifies)                 |
| `npm run brand`           | Rebuild logos, icons and splash images from the palette                                           |

CI runs lint, format check, tests, build and the browser tests on every pull request. The first time you run the browser tests, install the browser with `npx playwright install chromium`.

### How the tests are organised

- `server/test/` (Node's test runner): auth, sessions, rate limits, upload store and API, extraction pipeline with a fake AI, calculation API, config and hardening (headers, proxy, safe logging).
- `client/test/` (Vitest and Testing Library): every screen and flow, including Back button, focus, sign-out and colour contrast of every token.
- `shared/test/`: the money maths.
- `e2e/` (Playwright, with axe accessibility checks in light and dark): `journey.spec.js` is the full journey and the error paths (wrong codes, AI failing, connection lost, session ended, two tabs, two users, keyboard only, enlarged text); the other specs cover each feature in depth. Tests start their own API (port 4100) and web server (port 5273), so they work while `npm run dev` is running, and the AI is always the mock. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes. Sample pictures are in `e2e/fixtures/`.

### Web and mobile

Ledgerly is one responsive React app, designed for phone widths first, with a web manifest and icons so it can be added to a home screen. It is meant to be wrapped with [Capacitor](https://capacitorjs.com) for iOS and Android later; the icon and splash sources it needs are in `client/assets`.

### Look and feel

Pink, green and white with a matching dark theme that follows the device. Colours and type are tokens at the top of `client/src/styles.css`; every pair is checked for WCAG AA contrast by tests. To change the colours, edit the tokens and the palette at the top of `scripts/build-brand.mjs`, then run `npm run brand` to rebuild the logos, icons and splash images. Logo files are in `client/public/brand/`; a preview sheet is in [docs/brand/logo-preview.png](docs/brand/logo-preview.png).

## How it works

All API routes except sign-in need `Authorization: Bearer <token>`. The full list with request and answer shapes is in [SPEC.md](SPEC.md#api-endpoints).

**Sign in.** `POST /api/auth/request-otp` `{ phone }` sends a 6-digit code (valid 5 minutes, one per 30 seconds per number, 5 per hour). `POST /api/auth/verify-otp` `{ phone, code }` returns `{ token, expiresAt }` for a 12-hour session; five wrong tries lock the code. To protect a new API route, add the `requireAuth` middleware (`app.locals.requireAuth` in `server/src/app.js`); to protect a new page, nest its route inside `<RequireAuth>` in `client/src/App.jsx`. Sessions and codes live in server memory, so restarting signs everyone out.

**Pictures.** `POST /api/invoices` (multipart, field `image`) stores one JPEG, PNG, WebP or HEIC picture, decided by its bytes and not its name. Files live under `<UPLOAD_DIR>/<hash of owner>/<random id>.<ext>` with no client-chosen names, are only reachable by their owner (anyone else gets 404), and are deleted when removed, once read, or after `UPLOAD_TTL_HOURS`.

**Reading.** `POST /api/invoices/:id/extract` turns the picture into a JPEG of at most 2000 px (HEIC converted, rotation applied, location data removed), asks the provider (`claude` or `mock`), checks the answer against a strict schema and returns `{ debit, credit, currency, confidence, notes, warnings, lineItems, itemTotals, ... }`. Amounts are decimal strings (`"1250.50"`) or `null`, added in whole cents, never as floating point; an amount that could be read two ways (`1,234`), is negative or has more than 2 decimals becomes `null` with a warning instead of a guess. The picture is deleted once read; a failed reading keeps it for a retry. Provider failures go to the server log only, with keys removed.

**Calculating.** The maths lives in `shared/` (`@ledgerly/money`), used by both the server and the web app so the screen and the API always agree. Amounts are decimal strings held as whole minor units in `BigInt`. `POST /api/invoices/calculate` takes `{ "debit": "1250.50", "credit": "400.00" }` or `{ "items": ["1000.50", "-400.00"] }` (a minus sign is a Credit line) and answers `{ debit, credit, net, signedNet, type, lineCount }`. Numbers instead of text are refused.

**Hardening in place.** Codes are stored as keyed hashes, compared in constant time, single use and rate limited per number and per IP. Every API answer is `no-store` with `nosniff`, no framing and no referrer. Uploads are limited by size, type and count per user. Errors are logged as one line with configured keys and anything key-shaped hidden. Behind a proxy set `TRUST_PROXY`. More in the Security section of [SPEC.md](SPEC.md#security-and-privacy).
