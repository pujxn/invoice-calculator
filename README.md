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

SMS one-time-code login, invoice picture upload and AI reading of the Debit and Credit amounts work end to end. After a picture is uploaded, **Read amounts** shows the detected Debit and Credit (editable), the lines found and anything to double check. **Calculate final amount** then shows the net as a Net Debit, Net Credit or Balanced, with the working, and updates as you correct the amounts. Requirement status is tracked in SPEC.md.

## Layout

```
client/   React 18 + Vite web app (dev server on :5173, proxies /api to :4000)
server/   Node + Express API (:4000)
shared/   Exact-decimal money maths used by both (the calculation lives here)
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

### See the branding

- **Sign-in screen:** http://localhost:5173/login (sign out first if you are signed in) shows the logo, the tagline, the browser tab title and the tab icon. After signing in, the logo is in the header of the home page.
- **Dark mode:** switch your computer to dark mode, or in Chrome press F12, open the three-dot menu, then **More tools**, **Rendering**, and set _Emulate CSS prefers-color-scheme_ to dark. The logo and colours switch by themselves (pink on blush white by day, soft pink on deep plum at night).
- **Phone size:** in Chrome press F12, then Ctrl+Shift+M (Cmd+Shift+M on Mac), and pick a phone such as iPhone SE or iPhone 14.
- **Green and rose:** after you click **Send code**, the "We sent a code" notice is green. Once signed in, a thin soft-rose line runs under the header. The logo's credit bar is green.
- Logo files are in `client/public/brand/`; a preview sheet is in [docs/brand/logo-preview.png](docs/brand/logo-preview.png). Colours and type are tokens at the top of `client/src/styles.css`.
- **Changing the colours:** edit those tokens and the palette at the top of `scripts/build-brand.mjs`, then run `npm run brand` to rebuild the logos, icons and splash images.

### Try reading the amounts (about 3 minutes)

Sign in and upload a picture first (steps above). The app starts in **mock mode**: no AI key is needed, and the numbers shown are demo values made up from your picture's bytes (the same picture always gives the same numbers), so you can try the whole screen for free.

1. With a picture uploaded, press **Read amounts**. A spinner and "Reading your invoice…" appear, then **Amounts we found** shows a Debit box, a Credit box, a confidence line and a table of the lines found.
2. Change the Debit box to `12.345`: a red message says "Use at most 2 decimal places." Try `-5` and `abc` too. Then type `1300.5`, and press **Reset to what was found** to get the original numbers back.
3. Refresh the page: your edited numbers are still there. The picture is already gone from the server (it is deleted as soon as it has been read).
4. Press **Upload a different invoice** to start again.
5. Upload a picture, then press **Type the amounts instead** to skip the AI and type both amounts yourself.

#### Use the real AI (optional, costs a little per picture)

1. Get an API key from https://console.anthropic.com.
2. Copy the settings file once: `cp server/.env.example server/.env` (Windows: `copy server\.env.example server\.env`).
3. Open `server/.env` in any text editor and put your key after `ANTHROPIC_API_KEY=`, for example `ANTHROPIC_API_KEY=sk-ant-...`. Save.
4. Restart the app (`Ctrl+C`, then `npm run dev`). The terminal now says `vision: claude`.
5. Upload a photo of a real invoice and press **Read amounts**. The note under "Amounts we found" now says "Read from your picture by AI."

To go back to mock mode, empty the key line (or set `VISION_PROVIDER=mock`) and restart. The key stays on the server and is never sent to the browser. Tests never use the key.

Things worth trying:

- Upload an iPhone photo (HEIC): it is converted to a normal picture before the AI sees it.
- Press **Cancel** while it reads: nothing is lost and you can press **Read amounts** again.
- Upload a photo that is not an invoice (a selfie, a blank wall): you get a message and the picture stays so you can retry or type the amounts.
- If an amount is unclear (for example `1,234`, which could mean 1,234 or 1.234) the box is left empty and a "Please check" note explains why. The app never guesses an amount.

### Try the final amount (about 3 minutes)

Sign in, upload a picture and press **Read amounts** (steps above). This works in mock mode, with no AI key.

1. On **Amounts we found**, press **Calculate final amount**. The **Final amount** screen shows a label (**Net Debit**, **Net Credit** or **Balanced**), the amount in large type, and the working, for example `Debit £1,250.50 − Credit £400.00 = £850.50`. A table below shows how it was worked out.
2. Under **Change an amount**, change the Credit box to a bigger number than the Debit. The result flips to **Net Credit** straight away, with no button to press. Make them equal for **Balanced**.
3. Press **Copy result**, then paste somewhere (a notes app, a message). You get one line such as `Net Debit £850.50 (Debit £1,250.50 − Credit £400.00)`.
4. Refresh the page: you stay on the result with your edits. Press **Back to the invoice** to see the amounts screen again, or **Start a new invoice** to go back to upload (you stay signed in).

Things worth trying:

- Clear one box: a blank counts as none, so a Debit alone gives a Net Debit of that amount. Clear both: it says "Enter at least one amount".
- Type `0` in both boxes: **Balanced** `0.00` (zero is a real amount).
- Type `0.30` and `0.10`: exactly `0.20` (computers that use ordinary decimals get `0.19999999999999998`).
- Type `1,000,000.07` and `0.01`, or `999999999999.99`: large amounts keep every digit and are grouped with commas.
- Try `-5`, `12.345` or `abc`: the result is replaced by a clear message instead of a wrong number.
- Press **Type the amounts instead** on the upload screen to try your own numbers with no picture at all (no currency symbol is shown then).

The same maths is available on the server: while signed in, `POST /api/invoices/calculate` with `{"debit":"1250.50","credit":"400.00"}` (or `{"items":["1000.50","250.00","-400.00"]}` for a list of lines, where a minus sign means a Credit) answers with the exact result.

### Try it on your phone

Your computer and phone must be on the same Wi-Fi. Start the app with `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. The second command prints a `Network:` address such as `http://192.168.1.20:5173`. Open that address on your phone. The code still appears in the computer's terminal.

### Run the tests

| Command                           | What it checks                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Shared money maths, server and web app unit and component tests (fast)                                               |
| `npx playwright install chromium` | One-time download of the test browser                                                                                |
| `npm run test:ui`                 | Opens real browser windows in the background and clicks through login on a phone, a small phone and a desktop window |
| `npm run test:ui:screens`         | Same, and saves screenshots to `test-screenshots/` (not committed)                                                   |

Branding checks live in `e2e/branding.spec.js` (logo variant per colour scheme, titles, icons and manifest, accessibility with axe, contrast, focus ring, header fits 320 px) and in `client/test/` (logo and header components, brand SVGs and icons, colour contrast of every token pair).

### Web and mobile

Ledgerly is one responsive React app, designed for phone widths first. It has a web manifest and icons so it can be added to a home screen, and it is meant to be wrapped with [Capacitor](https://capacitorjs.com) for iOS and Android later. The icon and splash sources Capacitor needs are in `client/assets` (run `npx capacitor-assets generate` after adding Capacitor).

### Send real text messages (optional)

Create a free Twilio account, then put `SMS_PROVIDER=twilio` and your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `server/.env` and restart. The server refuses to start if one is missing. With a Twilio trial account you can only text numbers you have verified in Twilio.

## Scripts

| Command                   | What it does                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`             | Start API and web app together with reload                               |
| `npm run build`           | Production build of the web app (`client/dist`)                          |
| `npm start`               | Start the API only                                                       |
| `npm test`                | Run shared, server and web app tests                                     |
| `npm run test:ui`         | Run browser UI tests (Playwright, see below)                             |
| `npm run test:ui:screens` | Same, and refresh the screenshots in `test-screenshots/` (not committed) |
| `npm run brand`           | Rebuild logos, icons and splash images from the palette                  |
| `npm run lint`            | ESLint across the repo                                                   |
| `npm run format`          | Format with Prettier (`format:check` to verify)                          |

CI runs lint, format check, shared, server and client tests, build and UI tests on every pull request.

## UI tests

Every feature ships with Playwright UI tests in `e2e/`. They start their own API (port 4100, console SMS) and web dev server (port 5273), so they work while `npm run dev` is running. The first time, install the browser with `npx playwright install chromium`. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes.

`npm run test:ui:screens` also saves screenshots of each screen (phone, small phone, desktop) to `test-screenshots/`, or to `SCREENSHOT_DIR` if set. They are git-ignored; they are sent to the reviewer with the pull request, not committed. Sample invoice pictures for the tests are in `e2e/fixtures/` (`node e2e/fixtures/make-fixtures.mjs` recreates them).

## Environment variables

Set these in `server/.env` (see `server/.env.example`). With nothing set, one-time codes print to the server log and AI is off.

| Variable                    | Default                               | Purpose                                                                   |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `PORT`                      | `4000`                                | Port for the Node API                                                     |
| `SMS_PROVIDER`              | `console`                             | `console` prints codes to the log; `twilio` sends real SMS                |
| `TWILIO_ACCOUNT_SID`        | none                                  | Twilio account, needed for `twilio`                                       |
| `TWILIO_AUTH_TOKEN`         | none                                  | Twilio secret, needed for `twilio`                                        |
| `TWILIO_FROM_NUMBER`        | none                                  | Sending number in E.164 format                                            |
| `AUTH_SECRET`               | random per start                      | Key for hashing one-time codes; set to survive restarts                   |
| `AUTH_IP_REQUEST_LIMIT`     | `20`                                  | Code requests allowed per IP per 15 minutes                               |
| `AUTH_IP_VERIFY_LIMIT`      | `40`                                  | Code checks allowed per IP per 15 minutes                                 |
| `UPLOAD_DIR`                | `server/uploads`                      | Folder where uploaded invoice pictures are kept                           |
| `UPLOAD_MAX_MB`             | `10`                                  | Largest picture accepted                                                  |
| `UPLOAD_TTL_HOURS`          | `24`                                  | Pictures are deleted after this long                                      |
| `UPLOAD_MAX_PER_USER`       | `50`                                  | Pictures one user can keep at once                                        |
| `VISION_PROVIDER`           | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                                 |
| `ANTHROPIC_API_KEY`         | none                                  | Key for Claude vision                                                     |
| `ANTHROPIC_MODEL`           | `claude-opus-5-5`                     | Claude model used for extraction                                          |
| `ANTHROPIC_EFFORT`          | `medium`                              | How hard the model thinks: `low` to `max`, or `none`                      |
| `ANTHROPIC_TIMEOUT_SECONDS` | `60`                                  | Give up on one AI call after this long                                    |
| `ANTHROPIC_FALLBACKS`       | none                                  | Set to `default` to let the API retry a declined request on another model |
| `EXTRACT_PER_USER_PER_HOUR` | `30`                                  | Readings one user can start per hour (each costs money)                   |

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

## Reading the amounts

`POST /api/invoices/:id/extract` (no body, same sign-in header) reads the Debit and Credit amounts from one of the user's uploaded pictures and returns:

```json
{
  "invoiceId": "…",
  "provider": "claude",
  "model": "claude-opus-5-5",
  "imageDeleted": true,
  "debit": "1250.50",
  "credit": "400.00",
  "currency": "GBP",
  "confidence": "high",
  "notes": "…",
  "warnings": [{ "field": "debit", "code": "ambiguous", "message": "…" }],
  "lineItems": [{ "description": "Parts", "column": "debit", "amount": "1000.50" }],
  "itemTotals": { "debit": "1250.50", "credit": "400.00" }
}
```

- **Amounts are decimal strings** (`"1250.50"`) or `null` when not on the invoice, and are added in whole cents, never as floating point. An amount that could be read two ways (`1,234`), has more than 2 decimals, or is negative becomes `null` with a warning instead of a guess.
- **The picture is deleted** once it has been read (`imageDeleted`). If reading fails, it is kept so the user can retry.
- **Errors** (JSON `{ error, code }`): 404 unknown picture, 409 already being read, 422 `unreadable_image` / `unreadable_invoice` / `image_rejected` / `declined`, 429 `rate_limited` (also when a user exceeds `EXTRACT_PER_USER_PER_HOUR`; has `retryAfterSeconds` and `Retry-After`), 502 `provider_unavailable` / `provider_not_configured` / `bad_model_output`, 504 `timeout`. Details of provider failures go to the server log only.
- **How it works** (`server/src/extraction/`): `prepareImage.js` turns the picture into a JPEG of at most 2000 px (converts HEIC, applies phone rotation, drops location data); a provider (`providers/claude.js` or `providers/mock.js`) returns JSON; `schema.js` rejects anything that is not exactly the agreed shape; `normalize.js` and `money.js` turn it into exact decimals and warnings. Pick the provider with `VISION_PROVIDER` (`claude` or `mock`). Tests inject a fake provider, so no test calls the real API.
- On the web page, `<InvoiceFlow />` (`client/src/invoices/`) shows the upload screen and then the editable results; the reading is kept in this browser tab's session storage so a reload keeps edits.

## The calculation

The maths lives in `shared/` (package `@ledgerly/money`), a small dependency-free module that the server and the web app both import, so the screen and the API always give the same answer.

- **Exact money.** Amounts are decimal strings (`"1250.50"`) and are held as whole minor units (cents) in `BigInt`. Nothing is ever turned into a floating point number.
- **Signed line items.** `totalLines(items)` takes a list where a positive amount is a Debit line and a negative amount is a Credit line, and returns the Debit total, the Credit total, the net (never negative), the signed net and the type (`debit`, `credit` or `balanced`). `calculateNet({ debit, credit })` is the usual invoice as a list of two. A blank or missing side counts as 0, but at least one must be given.
- **Rules.** Amounts typed or sent must have at most 2 decimals (more is refused with a message, unless the caller passes `round: true`, which rounds each line half away from zero), may use thousands commas (`1,250.50`, or `12,50,000` in lakh style), and one amount is at most 999,999,999,999.99. A list may hold up to 5,000 lines.
- **Showing it.** `formatAmount("1250.5", "GBP")` is `£1,250.50`; unknown currency codes are written before the number, and rupees use lakh grouping. `describeResult` builds the label, the working and the line that Copy result copies.
- **API.** `POST /api/invoices/calculate` (signed in) takes `{ "debit": "1250.50", "credit": "400.00" }` or `{ "items": ["1000.50", "-400.00"] }` and answers `{ debit, credit, net, signedNet, type, lineCount }`. Amounts must be text: a JSON number is refused because it has already been through floating point.
- **Tests.** `shared/test/` (maths, formatting), `server/test/calculate.test.js` (API), `client/test/Result.test.jsx` (screen) and `e2e/calculate.spec.js` (whole flow in a browser).
- On the web page, `<ResultScreen />` (`client/src/invoices/`) is step 5; `<InvoiceFlow />` moves between upload, review and result.

## Build order

1. Repo setup and scaffold
2. SMS one-time-code login
3. Invoice upload
4. AI amount extraction
5. Review and calculation of the net amount (this step)
