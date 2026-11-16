# Invoice Calculator

Upload a photo of a standardised invoice showing a Debit and a Credit amount. AI reads the amounts, and the app shows the final net amount as a net Debit or net Credit. Users sign in with a one-time code sent by SMS.

The product spec is [SPEC.md](SPEC.md), a snapshot of the
[live spec doc](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs). Change the doc first, then update this file.

## Status

SMS one-time-code login and invoice picture upload work end to end (take or choose a photo, preview, progress, replace, remove). AI extraction and the calculation are built step by step; requirement status is tracked in SPEC.md.

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
   [sms:console] to +447700900123: Your Invoice Calculator code is 106950. It expires in 5 minutes.
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

### Try the invoice upload (about 2 minutes)

Sign in first (steps above). You land on **Upload your invoice**.

1. Press **Choose file** and pick any JPEG, PNG, WebP or HEIC picture (a screenshot works). A preview, the file name and size appear, and "Picture uploaded." is shown.
2. Refresh the page: the picture is still there.
3. Press **Replace picture** and pick another one: the preview changes.
4. Press **Remove**: you are back to the two buttons.

On a phone (see below) there is also a **Take photo** button that opens the camera. On a computer that button is hidden.

Things worth trying:

- Pick a PDF or text file: "That file is not a JPEG, PNG, WebP or HEIC picture." and nothing is uploaded.
- Rename a text file to `fake.jpg` and pick it: the browser lets it through but the server looks inside the file and refuses it.
- Pick a picture over 10 MB: it is refused with its size.
- Pick a HEIC photo from an iPhone: it uploads; most browsers show "No preview" because they cannot draw HEIC.
- Sign out and sign in with another number: you do not see the first number's picture.

Pictures are saved in `server/uploads/` (change with `UPLOAD_DIR`) and deleted automatically after 24 hours.

### Try it on your phone

Your computer and phone must be on the same Wi-Fi. Start the app with `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. The second command prints a `Network:` address such as `http://192.168.1.20:5173`. Open that address on your phone. The code still appears in the computer's terminal.

### Run the tests

| Command                           | What it checks                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Server and web app unit and component tests (fast)                                                                   |
| `npx playwright install chromium` | One-time download of the test browser                                                                                |
| `npm run test:ui`                 | Opens real browser windows in the background and clicks through login on a phone, a small phone and a desktop window |
| `npm run test:ui:screens`         | Same, and saves screenshots to `e2e/.screenshots/` (not committed)                                                   |

### Send real text messages (optional)

Create a free Twilio account, then put `SMS_PROVIDER=twilio` and your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `server/.env` and restart. The server refuses to start if one is missing. With a Twilio trial account you can only text numbers you have verified in Twilio.

## Scripts

| Command                   | What it does                                      |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | Start API and web app together with reload        |
| `npm run build`           | Production build of the web app (`client/dist`)   |
| `npm start`               | Start the API only                                |
| `npm test`                | Run server tests (Node's built-in runner)         |
| `npm run test:ui`         | Run browser UI tests (Playwright, see below)      |
| `npm run test:ui:screens` | Same, and save screenshots to `e2e/.screenshots/` |
| `npm run lint`            | ESLint across the repo                            |
| `npm run format`          | Format with Prettier (`format:check` to verify)   |

CI runs lint, format check, server tests, client tests, build and UI tests on every pull request.

## UI tests

Every feature ships with Playwright UI tests in `e2e/`. They start their own API (port 4100, console SMS) and web dev server (port 5273), so they work while `npm run dev` is running. The first time, install the browser with `npx playwright install chromium`. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes.

`npm run test:ui:screens` also saves screenshots of each screen (phone, small phone, desktop) to `e2e/.screenshots/`, or to `SCREENSHOT_DIR` if set. They are git-ignored; they are sent to the reviewer with the pull request, not committed. Sample invoice pictures for the tests are in `e2e/fixtures/` (`node e2e/fixtures/make-fixtures.mjs` recreates them).

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
| `UPLOAD_DIR`            | `server/uploads`                      | Folder where uploaded invoice pictures are kept            |
| `UPLOAD_MAX_MB`         | `10`                                  | Largest picture accepted                                   |
| `UPLOAD_TTL_HOURS`      | `24`                                  | Pictures are deleted after this long                       |
| `UPLOAD_MAX_PER_USER`   | `50`                                  | Pictures one user can keep at once                         |
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

## Invoice pictures

All routes need `Authorization: Bearer <token>` and only ever see the signed-in user's own pictures (another user's id is a 404).

- `POST /api/invoices` multipart form, field `image` (JPEG, PNG, WebP or HEIC, up to `UPLOAD_MAX_MB`) returns 201 `{ id, mimeType, size, createdAt, imageUrl }`. The type is decided from the file's bytes, not its name. Errors: 400 no or empty file, 413 too big, 415 not a supported picture, 429 too many stored pictures.
- `GET /api/invoices/:id` returns the same details; `GET /api/invoices/:id/image` returns the picture itself; `DELETE /api/invoices/:id` removes it.

Files are stored as `<UPLOAD_DIR>/<hash of the owner>/<random id>.<ext>` with no client-chosen names, and are deleted after `UPLOAD_TTL_HOURS`. On the web page, `<InvoiceUpload />` (in `client/src/invoices/`) is the screen; the later extraction step reads the picture by its id.

## Build order

1. Repo setup and scaffold
2. SMS one-time-code login
3. Invoice upload (this step)
4. AI amount extraction
5. Review and calculation of the net amount
