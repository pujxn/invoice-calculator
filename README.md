# Invoice Calculator

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

## Setup

Requires Node 20.12 or newer.

```bash
npm install
cp server/.env.example server/.env   # optional: the defaults need no credentials
npm run dev                          # API on :4000, web app on :5173
```

Open http://localhost:5173. You land on the sign-in page. With the default `SMS_PROVIDER=console` no SMS is sent: enter any number in international format (for example `+44 7700 900123`), then read the 6-digit code from the terminal running `npm run dev`:

```
[sms:console] to +447700900123: Your Invoice Calculator code is 106950. It expires in 5 minutes.
```

Enter it to sign in. `GET /api/health` shows the active providers.

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

CI runs lint, format check, server tests, build and UI tests on every pull request.

## UI tests

Every feature ships with Playwright UI tests in `e2e/`. They start their own API (port 4100, console SMS) and web dev server (port 5273), so they work while `npm run dev` is running. The first time, install the browser with `npx playwright install chromium`. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes.

`npm run test:ui:screens` also saves mobile-size screenshots of each screen to `docs/screenshots/`; they are attached to the pull request for review.

## Environment variables

Set these in `server/.env` (see `server/.env.example`). With nothing set, one-time codes print to the server log and AI is off.

| Variable             | Default                               | Purpose                                                    |
| -------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `PORT`               | `4000`                                | Port for the Node API                                      |
| `SMS_PROVIDER`       | `console`                             | `console` prints codes to the log; `twilio` sends real SMS |
| `TWILIO_ACCOUNT_SID` | none                                  | Twilio account, needed for `twilio`                        |
| `TWILIO_AUTH_TOKEN`  | none                                  | Twilio secret, needed for `twilio`                         |
| `TWILIO_FROM_NUMBER` | none                                  | Sending number in E.164 format                             |
| `AUTH_SECRET`        | random per start                      | Key for hashing one-time codes; set to survive restarts    |
| `VISION_PROVIDER`    | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                  |
| `ANTHROPIC_API_KEY`  | none                                  | Key for Claude vision                                      |
| `ANTHROPIC_MODEL`    | `claude-opus-5-5`                     | Claude model used for extraction                           |

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
