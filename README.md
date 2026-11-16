# Invoice Calculator

Upload a photo of a standardised invoice showing a Debit and a Credit amount. AI reads the amounts, and the app shows the final net amount as a net Debit or net Credit. Users sign in with a one-time code sent by SMS.

The product spec is [SPEC.md](SPEC.md), a snapshot of the
[live spec doc](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs). Change the doc first, then update this file.

## Status

Scaffold only: the API has a health check and the web app is a placeholder shell. Login, upload, AI extraction and the calculation are built step by step; requirement status is tracked in SPEC.md.

## Layout

```
client/   React 18 + Vite web app (dev server on :5173, proxies /api to :4000)
server/   Node 20+ + Express API (:4000)
SPEC.md   Product spec, source of truth
```

## Setup

Requires Node 20 or newer.

```bash
npm install
cp server/.env.example server/.env   # optional: the defaults need no credentials
npm run dev                          # API on :4000, web app on :5173
```

Open http://localhost:5173. The page shows "API ok" with the active providers when both servers are running.

## Scripts

| Command          | What it does                                    |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | Start API and web app together with reload      |
| `npm run build`  | Production build of the web app (`client/dist`) |
| `npm start`      | Start the API only                              |
| `npm test`       | Run server tests (Node's built-in runner)       |
| `npm run lint`   | ESLint across the repo                          |
| `npm run format` | Format with Prettier (`format:check` to verify) |

CI runs lint, format check, tests and build on every pull request.

## Environment variables

Set these in `server/.env` (see `server/.env.example`). With nothing set, one-time codes print to the server log and AI is off.

| Variable             | Default                               | Purpose                                                    |
| -------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `PORT`               | `4000`                                | Port for the Node API                                      |
| `SMS_PROVIDER`       | `console`                             | `console` prints codes to the log; `twilio` sends real SMS |
| `TWILIO_ACCOUNT_SID` | none                                  | Twilio account, needed for `twilio`                        |
| `TWILIO_AUTH_TOKEN`  | none                                  | Twilio secret, needed for `twilio`                         |
| `TWILIO_FROM_NUMBER` | none                                  | Sending number in E.164 format                             |
| `VISION_PROVIDER`    | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                  |
| `ANTHROPIC_API_KEY`  | none                                  | Key for Claude vision                                      |
| `ANTHROPIC_MODEL`    | `claude-opus-5-5`                     | Claude model used for extraction                           |

Configuration is read in one place, `server/src/config.js`. Never commit `.env`.

## Build order

1. Repo setup and scaffold (this step)
2. SMS one-time-code login
3. Invoice upload
4. AI amount extraction
5. Review and calculation of the net amount
