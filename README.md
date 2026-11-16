<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-dark.svg" />
    <img src="client/public/brand/logo.svg" alt="Ledgerly" height="64" />
  </picture>
</p>

# Ledgerly

Upload a photo of a standardised invoice showing a Debit and a Credit amount. AI reads the amounts, and the app shows the final net amount as a net Debit or net Credit. Users sign in with a one-time code sent by SMS.

The product spec is [SPEC.md](SPEC.md), a snapshot of the
[live spec doc](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs). Change the doc first, then update this file.

## Status

SMS one-time-code login works end to end (phone, code, session, sign out, protected routes). Upload, AI extraction and the calculation are built step by step; requirement status is tracked in SPEC.md.

## Layout

```
client/   React 18 + Vite web app (dev server on :5173, proxies /api to :4000)
server/   Node + Express API (:4000)
SPEC.md   Product spec, source of truth
```

## Run it on your computer

You need [Node.js](https://nodejs.org) version 20.12 or newer. Check with `node -v`.

1. Open a terminal in the project folder.
2. Install everything (once): `npm install`
3. Start the app: `npm run dev`
4. Open http://localhost:5173 in your browser.

No accounts or keys are needed. This is "mock mode": no real text message is sent. Instead the code is printed in the terminal where `npm run dev` is running. To stop the app, press `Ctrl+C` in that terminal.

Optional: `cp server/.env.example server/.env` lets you change settings later (see the table below). You can skip it.

### Try the login (about 2 minutes)

1. Open http://localhost:5173. You are sent to the **Sign in** page because you are not signed in.
2. Type a phone number with the country code, for example `+44 7700 900123`, and press **Send code**.
3. Look at the terminal running `npm run dev`. You will see a line like this; the 6 digits are your code:
   ```
   [sms:console] to +447700900123: Your Ledgerly code is 106950. It expires in 5 minutes.
   ```
4. Type the 6 digits into the page and press **Sign in**. You should see "Signed in as +447700900123".
5. Refresh the page: you stay signed in.
6. Press **Sign out**: you are back on the Sign in page. Opening http://localhost:5173 again keeps sending you there.

Things worth trying:

- Type `07700 900123` (no country code): you get an error and no code is sent.
- Enter a wrong code: "Wrong code. 4 tries left." After 5 wrong tries even the right code is refused; press Resend (or Change number) to get a new one.
- Press Send code twice quickly: "Please wait 30 seconds…". The Resend button counts down from 30.
- Wait 5 minutes before entering a code: it says the code has expired.
- Restart `npm run dev`: you are signed out (sessions live in server memory).

### See the branding

- **Sign-in screen:** http://localhost:5173/login (sign out first if you are signed in) shows the logo, the tagline, the browser tab title and the tab icon. After signing in, the logo is in the header of the home page.
- **Dark mode:** switch your computer to dark mode, or in Chrome press F12, open the three-dot menu, then **More tools**, **Rendering**, and set _Emulate CSS prefers-color-scheme_ to dark. The logo and colours switch by themselves.
- **Phone size:** in Chrome press F12, then Ctrl+Shift+M (Cmd+Shift+M on Mac), and pick a phone such as iPhone SE or iPhone 14.
- Logo files are in `client/public/brand/`; a preview sheet is in [docs/brand/logo-preview.png](docs/brand/logo-preview.png). Colours and type are tokens at the top of `client/src/styles.css`.

### Try it on your phone

Your computer and phone must be on the same Wi-Fi. Start the app with `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. The second command prints a `Network:` address such as `http://192.168.1.20:5173`. Open that address on your phone. The code still appears in the computer's terminal.

### Run the tests

| Command                           | What it checks                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Server and web app unit and component tests (fast)                                                                   |
| `npx playwright install chromium` | One-time download of the test browser                                                                                |
| `npm run test:ui`                 | Opens real browser windows in the background and clicks through login on a phone, a small phone and a desktop window |
| `npm run test:ui:screens`         | Same, and saves screenshots to `docs/screenshots/`                                                                   |

Branding checks live in `e2e/branding.spec.js` (logo variant per colour scheme, titles, icons and manifest, accessibility with axe, contrast, focus ring, header fits 320 px) and in `client/test/` (logo and header components, brand SVGs and icons, colour contrast of every token pair).

### Web and mobile

Ledgerly is one responsive React app, designed for phone widths first. It has a web manifest and icons so it can be added to a home screen, and it is meant to be wrapped with [Capacitor](https://capacitorjs.com) for iOS and Android later. The icon and splash sources Capacitor needs are in `client/assets` (run `npx capacitor-assets generate` after adding Capacitor).

### Send real text messages (optional)

Create a free Twilio account, then put `SMS_PROVIDER=twilio` and your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `server/.env` and restart. The server refuses to start if one is missing. With a Twilio trial account you can only text numbers you have verified in Twilio.

## Scripts

| Command                   | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start API and web app together with reload               |
| `npm run build`           | Production build of the web app (`client/dist`)          |
| `npm start`               | Start the API only                                       |
| `npm test`                | Run server tests (Node's built-in runner)                |
| `npm run test:ui`         | Run browser UI tests (Playwright, see below)             |
| `npm run test:ui:screens` | Same, and refresh the screenshots in `docs/screenshots/` |
| `npm run lint`            | ESLint across the repo                                   |
| `npm run format`          | Format with Prettier (`format:check` to verify)          |

CI runs lint, format check, server tests, client tests, build and UI tests on every pull request.

## UI tests

Every feature ships with Playwright UI tests in `e2e/`. They start their own API (port 4100, console SMS) and web dev server (port 5273), so they work while `npm run dev` is running. The first time, install the browser with `npx playwright install chromium`. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes.

`npm run test:ui:screens` also saves mobile-size screenshots of each screen to `docs/screenshots/`; they are attached to the pull request for review.

## Environment variables

Set these in `server/.env` (see `server/.env.example`). With nothing set, one-time codes print to the server log and AI is off.

| Variable                | Default                               | Purpose                                                    |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `PORT`                  | `4000`                                | Port for the Node API                                      |
| `SMS_PROVIDER`          | `console`                             | `console` prints codes to the log; `twilio` sends real SMS |
| `TWILIO_ACCOUNT_SID`    | none                                  | Twilio account, needed for `twilio`                        |
| `TWILIO_AUTH_TOKEN`     | none                                  | Twilio secret, needed for `twilio`                         |
| `TWILIO_FROM_NUMBER`    | none                                  | Sending number in E.164 format                             |
| `AUTH_SECRET`           | random per start                      | Key for hashing one-time codes; set to survive restarts    |
| `AUTH_IP_REQUEST_LIMIT` | `20`                                  | Code requests allowed per IP per 15 minutes                |
| `AUTH_IP_VERIFY_LIMIT`  | `40`                                  | Code checks allowed per IP per 15 minutes                  |
| `VISION_PROVIDER`       | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                  |
| `ANTHROPIC_API_KEY`     | none                                  | Key for Claude vision                                      |
| `ANTHROPIC_MODEL`       | `claude-opus-5-5`                     | Claude model used for extraction                           |

To send real SMS, set `SMS_PROVIDER=twilio` with the three `TWILIO_*` values; the server refuses to start if any is missing. Configuration is read in one place, `server/src/config.js`. Never commit `.env`.

## Login

- `POST /api/auth/request-otp` `{ phone }` sends a 6-digit code (valid 5 minutes, one per 30 seconds per number, 5 per hour).
- `POST /api/auth/verify-otp` `{ phone, code }` returns `{ token, expiresAt }` (12-hour session). Five wrong tries lock the code.
- `GET /api/auth/me` and `POST /api/auth/logout` need `Authorization: Bearer <token>`.

To protect a new API route, add the `requireAuth` middleware (`app.locals.requireAuth` in `server/src/app.js`). To protect a new page, nest its route inside `<RequireAuth>` in `client/src/App.jsx`.

Sessions and codes live in server memory, so restarting the server signs everyone out.

## Build order

1. Repo setup and scaffold
2. SMS one-time-code login (this step)
3. Invoice upload
4. AI amount extraction
5. Review and calculation of the net amount
