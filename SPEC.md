# Ledgerly: Product Spec

> The live, editable copy of this spec is the Claude Doc
> [Ledgerly: Product Spec](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs).
> This file is a snapshot of it for the repo. Change the doc first, then update this file and the changelog.

Version 0.9 · 2026-11-16

## Overview

Ledgerly (the working title was Invoice Calculator) reads a photo of a standardised invoice showing a Debit amount and a Credit amount, and tells the user the final net amount and whether it is a net Debit or a net Credit. This spec is the source of truth for the product; every change to scope is recorded here first.

**Users:** people who receive simple standardised invoices and need the net figure quickly, signing in with their mobile number.

**Prototype goals**

- Sign in with a one-time code sent by SMS, no passwords.
- Upload or take a photo of an invoice.
- AI image recognition reads the Debit and Credit amounts.
- The user checks and corrects the amounts, then sees the final net amount.
- Runs locally with no paid credentials (mock SMS and manual entry), and with real SMS and AI once keys are added.

**Not in the prototype:** saved history, converting between currencies, adding up long multi-line invoices on screen (the lines are read and shown, and the calculation and API can already total a list of lines, but the screen's net uses the printed totals), user profiles, a production database, deployment, and native mobile apps. These are tracked in the Roadmap.

## User flow

A user goes from phone number to net result in five screens, with a chance to fix the AI's reading before the result is final.

1. **Enter phone number.** The user types a mobile number in international format (for example +44 7700 900123) and taps Send code.
2. **Enter code.** A 6-digit code arrives by SMS. The user enters it; a wrong code shows an error, and Resend is available after 30 seconds.
3. **Upload invoice.** The user picks or takes a photo (JPEG, PNG, WebP or HEIC, up to 10 MB) and sees a preview.
4. **Review amounts.** The user presses Read amounts; AI reads the Debit and Credit amounts and pre-fills two fields, with a confidence note, anything to double check and the lines it found. The user can edit either field, clear one, type the amounts by hand instead, or upload a different photo.
5. **See result.** The user presses Calculate final amount. The app shows the net amount large, labelled Net Debit, Net Credit, or Balanced, with the working (Debit minus Credit) and a breakdown of the inputs. Debit and Credit can be changed on this screen and the result updates as they are typed. The user can copy the result, go back to the invoice (the browser's Back button does the same), start a new invoice (no new sign-in), or sign out. A reload at any step keeps the user's place and edits; signing out clears them from the browser.

## From the whiteboard sketch

The whiteboard photo in the project (IMG_0688) suggests a larger product than the flow above: an admin who manages agents, and a running list of entries per agent. This is a reading of it and needs confirming before it goes into the requirements.

- **Superadmin adds agents** by name and mobile number ("Add Agent: mobile, name"); only added numbers can sign in.
- **Agents sign in** with mobile number and OTP, then see two options: Add (new invoice) and List.
- **Upload screen** has Browse and Submit; the image goes to AI for image-to-text.
- **Results list** shows each extracted amount, with a pop-up to correct a value.
- **Per-agent figures:** each agent has a Debit and Credit pair, for example 50,000 and 10,000.
- **Totals:** a column of amounts adds up to one total, with some lines crossed out and one ticked, which may mean excluded and approved entries.

## Features and requirements

The prototype has 17 requirements across five areas; the Status column tracks each one as it is built.

| ID | Area | Requirement | Status |
| --- | --- | --- | --- |
| AUTH-1 | Login | User enters a mobile number in E.164 format; invalid numbers are rejected with a message. | Built |
| AUTH-2 | Login | Server sends a random 6-digit code by SMS; it expires after 5 minutes. | Built |
| AUTH-3 | Login | A code allows at most 5 wrong attempts, then a new code is needed. | Built |
| AUTH-4 | Login | Resend is limited to once per 30 seconds per number. | Built |
| AUTH-5 | Login | A correct code starts a session that lasts 12 hours; the user can sign out. | Built |
| UP-1 | Upload | Only signed-in users can upload. | Built |
| UP-2 | Upload | Accepts JPEG, PNG, WebP and HEIC up to 10 MB; on phones the camera can be used. | Built |
| UP-3 | Upload | Shows a preview of the chosen image before extraction (HEIC shows a "No preview" note in browsers that cannot draw it), with progress, cancel, replace and remove. | Built |
| AI-1 | Extraction | A vision AI model (Claude; model set by `ANTHROPIC_MODEL`) reads the uploaded picture and returns the Debit and Credit amounts as exact decimal strings (for example `"1250.50"`), or null when a value is not on the invoice. If the picture lists lines, they are returned too, with the total of each column. The answer is checked against a strict schema; anything off-shape is rejected. An amount that could be read two ways (`1,234`), is negative or has more than 2 decimals is returned as null with a warning, never guessed. HEIC is converted to JPEG first. | Built |
| AI-2 | Extraction | The response includes a confidence level (high, medium, low), a short note, warnings for anything to check, and the currency code if one is shown. | Built |
| AI-3 | Extraction | If the AI is not configured (mock mode shows demo values), is busy, times out or fails, the user sees a clear message, can retry, or can type the amounts by hand. Unreadable pictures, missing amounts and ambiguous values are reported the same way. | Built |
| AI-4 | Extraction | Uploaded images are kept only briefly: deleted when the user removes or replaces them, automatically after 24 hours (`UPLOAD_TTL_HOURS`), and as soon as the amounts have been read (or the user chooses to type them). A failed reading keeps the picture so the user can retry. The image is sent only to the AI provider, resized and stripped of location data. | Built |
| CALC-1 | Calculation | User can edit both amounts before calculating, and again on the result screen; amounts must be 0 or more with up to 2 decimals (thousands commas are accepted when typing). | Built |
| CALC-2 | Calculation | Net = Debit minus Credit, using the rules in Calculation rules. The calculation works on a list of signed line items (positive is a Debit line, negative is a Credit line); a Debit and a Credit is a list of two. | Built |
| CALC-3 | Calculation | Calculation uses exact decimal maths (whole cents in BigInt, amounts as decimal strings), not floating point. One shared module is used by the server and the web app. | Built |
| RES-1 | Result | Shows the net amount, its label (Net Debit, Net Credit, Balanced) and the working, with a breakdown of the inputs. Debit and Credit can be edited on the screen and the result updates as they are typed. The result can be copied. | Built |
| RES-2 | Result | User can start a new invoice without signing in again. | Built |

## Calculation rules

The final amount is Debit minus Credit: a positive result is a Net Debit, a negative result is a Net Credit shown as a positive number, and zero is Balanced.

```
net = Debit - Credit
```

- A missing value counts as 0, so an invoice with only a Debit gives a Net Debit of that amount, and only a Credit gives a Net Credit.
- If both values are missing, the app asks the user to enter at least one before calculating.
- Negative inputs are not allowed; a minus sign read from the image is shown to the user to confirm.
- Results are rounded to 2 decimal places. Inputs already have at most 2 decimals, so the maths never needs to round: an amount with more than 2 decimals is refused, never silently rounded. (The shared module can round half away from zero line by line when a caller asks for it; nothing uses that yet.)
- Zero is a real amount: a Debit of 0 and a Credit of 0 is Balanced 0.00, while two blank boxes is "enter at least one amount".
- One amount can be up to 999,999,999,999.99. Totals of several lines may go beyond that and keep every digit.
- Amounts are shown with thousands separators and 2 decimals. The currency symbol is shown when the invoice has a currency code (£ $ € ₹ and similar; an unknown code is written before the number, for example CHF 1,250.00). Indian rupee amounts use lakh grouping (12,34,567.00). With no currency, only the number is shown.

**Line items.** The calculation takes a list of signed line items and totals them: net is the sum of the lines, a positive line is a Debit and a negative line a Credit. The usual invoice is a list of two lines (Debit, minus Credit). The screen still works on the printed Debit and Credit; the API (below) already accepts a list of up to 5,000 lines, ready for invoices with many line items.

| Debit | Credit | Result |
| --- | --- | --- |
| 1,250.00 | 400.00 | Net Debit 850.00 |
| 300.00 | 975.50 | Net Credit 675.50 |
| 500.00 | 500.00 | Balanced 0.00 |
| 720.00 | (none) | Net Debit 720.00 |
| (none) | 99.99 | Net Credit 99.99 |

## Architecture and tech stack

A React web app talks to one Node API, and the API talks to an SMS provider and a vision AI provider that are each chosen by a setting, so either can be swapped without changing the app. (The architecture diagram is in the live doc.)

```
React web app (Vite)  --JSON-->  Node API (Express)  --code-->   SMS provider (console | twilio)
                                   auth, invoices,   --image-->  Vision AI provider (claude | mock)
                                   calculator, in-memory store
```

- **Client:** React 18 with Vite, plain CSS, mobile first (touch-sized controls, numeric keypad, SMS code autofill). The product must run on web and mobile; the plan is this responsive web app wrapped with Capacitor for iOS and Android, which is a later step.
- **Server:** Node 20+ with Express; multer for uploads; the Anthropic SDK for Claude vision.
- **Repo:** one GitHub repo, `invoice-calculator`, with `client/` and `server/` folders and one `npm run dev` that starts both.
- **Tests:** Node's built-in test runner for the server (calculator, auth), Vitest and Testing Library for React components, and Playwright UI tests (`e2e/`, with axe accessibility checks) for every feature. Every feature ships with tests at the levels it touches.
- **Installable:** the web app has a manifest and icons so it can be added to a home screen, and `client/assets` holds the icon and splash sources Capacitor needs.

## Branding

The product is called **Ledgerly**. The logo is a ledger mark (a vertical rule, a longer debit bar, a shorter green credit bar and a total line, which also reads as an L) next to the wordmark in Inter SemiBold, outlined so the SVGs need no fonts.

- **Files:** `client/public/brand/` holds the lockup and the mark, each in light and dark, plus the favicon, `apple-touch-icon.png` and the PWA icons. `client/assets/` holds the Capacitor sources: `icon-only`, `icon-foreground` and `icon-background` (1024 px) and `splash` and `splash-dark` (2732 px). A preview is in `docs/brand/logo-preview.png`.
- **Colour:** a pink UI with green and soft rose accents on white. Light theme: ledger pink `#c2185b` (primary, white text on it), blush white `#fff7fa` background, plum ink `#2b1020` text, credit green `#145c33` on `#e1f5e8` (success and credit), mint `#a6efc3` for the credit bar in the logo (dark logo: forest `#1a7a46`), and soft rose `#f0a3c3` for the header rule (decoration only). Dark theme: soft pink `#ff8fb8` on deep plum `#1c0f16`, with surfaces `#2a1822` and text `#fbeaf1`. The dark theme follows the device setting. Logo, icons and splash are generated from the palette by `npm run brand`.
- **Type:** Inter if installed, else the system font; no web font is downloaded.
- **Accessibility:** text and controls meet WCAG AA (4.5:1 text, 3:1 control outlines), buttons are at least 48 px tall, the logo has the alt text "Ledgerly", and focus rings are always visible. Contrast ratios of the colour tokens are checked by tests.
- **Where it shows:** browser tab title and icon, sign-in screen, the header of every signed-in page, and the SMS text ("Your Ledgerly code is ...").

## API endpoints

The Node server exposes JSON endpoints under `/api`; all except the two code calls (`request-otp`, `verify-otp`) need an `Authorization: Bearer <session token>` header.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/auth/request-otp` | `{ phone }` | `{ ok: true, resendAfterSeconds: 30 }` |
| `POST /api/auth/verify-otp` | `{ phone, code }` | `{ token, expiresAt }` or 401 with `{ error }` |
| `POST /api/auth/logout` | none | `{ ok: true }` |
| `GET /api/auth/me` | none | `{ phone, expiresAt }`, used by the web app to check a stored session |
| `POST /api/invoices` | multipart form, field `image` | 201 `{ id, mimeType, size, createdAt, imageUrl }`; own pictures only |
| `GET /api/invoices/:id` | none | the same details, or 404 |
| `GET /api/invoices/:id/image` | none | the picture bytes, or 404 |
| `DELETE /api/invoices/:id` | none | `{ ok: true }`, or 404 |
| `POST /api/invoices/:id/extract` | none | `{ invoiceId, provider, model, imageDeleted, debit, credit, currency, confidence, notes, warnings, lineItems, itemTotals }`; amounts are decimal strings or null. Deletes the picture on success |
| `POST /api/invoices/calculate` | `{ debit, credit }` (text or null), or `{ items: [...] }` of signed line items (text, or `{ amount }`) | `{ debit, credit, net, signedNet, type, lineCount }`: all amounts are exact decimal strings, `debit` and `credit` are the totals of each side, `net` is never negative, `signedNet` is Debit minus Credit, and `type` is `debit`, `credit` or `balanced`. Needs a signed-in user. Numbers instead of text are refused (400) |

Errors use HTTP status codes (400 bad input, 401 not signed in, 404 not found or not yours, 413 file or request too large, 415 not a supported picture, 409 already being read, 422 picture or invoice could not be read, 429 too many requests or AI busy, 502 AI or SMS provider failed, 504 AI too slow) with a body of `{ error: "message" }`. A 429 from the auth calls also carries `retryAfterSeconds` and a `Retry-After` header. A wrong code is 401; after 5 wrong tries the code is locked and further tries get 429 until a new code is requested.

A `GET /api/health` endpoint (no auth) reports that the server is up and which providers are configured. An unknown `/api/...` address answers 404 `{ error: "Not found." }` in JSON. Every API answer carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.

## Configuration

The prototype runs with no settings at all: codes print to the server log and amounts are typed by hand. Setting the variables below in `server/.env` switches on real SMS and AI.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 4000 | Port for the Node API |
| `NODE_ENV` | none | `production` makes start-up warn about console SMS, the mock AI and a missing `AUTH_SECRET` |
| `TRUST_PROXY` | 0 | Number of proxies in front of the server (usually 1), so per-IP limits see the visitor and not the proxy. Only a whole number is accepted, never "trust everyone" |
| `SMS_PROVIDER` | `console` | `console` prints codes to the log; `twilio` sends real SMS |
| `TWILIO_ACCOUNT_SID` | none | Twilio account, needed for `twilio` |
| `TWILIO_AUTH_TOKEN` | none | Twilio secret, needed for `twilio` |
| `TWILIO_FROM_NUMBER` | none | Sending number in E.164 format |
| `AUTH_SECRET` | random per start | Key used to hash one-time codes; set it to keep codes valid across restarts |
| `AUTH_IP_REQUEST_LIMIT` | 20 | Code requests allowed per IP per 15 minutes |
| `AUTH_IP_VERIFY_LIMIT` | 40 | Code checks allowed per IP per 15 minutes |
| `UPLOAD_DIR` | `server/uploads` | Folder where uploaded pictures are kept |
| `UPLOAD_MAX_MB` | 10 | Largest picture accepted |
| `UPLOAD_TTL_HOURS` | 24 | Pictures are deleted after this long |
| `UPLOAD_MAX_PER_USER` | 50 | Pictures one user can keep at once |
| `VISION_PROVIDER` | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI |
| `ANTHROPIC_API_KEY` | none | Key for Claude vision |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model used for extraction |
| `ANTHROPIC_EFFORT` | `medium` | How hard the model thinks (`low` to `max`, or `none`) |
| `ANTHROPIC_TIMEOUT_SECONDS` | 60 | One AI call is abandoned after this long |
| `ANTHROPIC_FALLBACKS` | none | `default` lets the API retry a declined request on another model |
| `EXTRACT_PER_USER_PER_HOUR` | 30 | Readings one user can start per hour |

## Security and privacy

The prototype keeps invoice images only briefly (see AI-4) and stores codes only as hashes, but it is not production-ready until the items marked later are done.

- Codes are stored hashed, compared in constant time, expire after 5 minutes and lock after 5 wrong tries.
- Code requests are rate limited per phone number (one per 30 seconds, 5 per hour) and per IP address (20 per 15 minutes); code checks are limited to 40 per IP per 15 minutes. This limits SMS cost abuse and guessing.
- Codes are keyed hashes (HMAC-SHA256 with a server secret) tied to the phone number, and are single use.
- Session tokens are random 32-byte values held in server memory (only their SHA-256 is kept); restarting the server signs everyone out. The web app keeps the token in the browser's localStorage, so a script injected into the page could read it; moving to an HttpOnly cookie is a later hardening item.
- Uploaded pictures are checked by their bytes (not their name), stored under a hashed owner folder with random file names, readable only by their owner, and deleted after 24 hours or when removed. They are sent only to the configured AI provider, after being converted to a JPEG of at most 2000 px with location data removed, and are deleted as soon as they have been read. Reading is limited per user per hour because each real reading costs money; the AI's answer is validated before it reaches the user, and text inside a picture is treated as data, never as instructions.
- API keys live in environment variables and never reach the browser, and never reach the log: provider errors are logged as one line (name, status, message) with every configured key and anything shaped like a key blanked out, never as raw objects, headers or stack traces.
- Per-IP limits use the address the server sees. Behind a proxy `TRUST_PROXY` tells it how many proxies to trust; a forged `X-Forwarded-For` is ignored otherwise.
- API answers are never cached and cannot be framed or type-sniffed (see API endpoints). Uploaded folders are tidied up: pictures older than 24 hours go, and so does the folder of a user who has none left.
- Signing out (or the session ending, here or in another tab of the same browser) removes the sign-in token and the amounts and picture reference kept for the current tab.
- Start-up warns when `NODE_ENV=production` is combined with console SMS (anyone who can read the log can sign in), the mock AI (users would see made-up amounts) or no `AUTH_SECRET`.
- Known gaps, not fixed in the prototype: the session token is in `localStorage` (script injection could read it); sessions, codes and rate-limit counters are in memory, so they reset on restart and are not shared between several server processes; there is no per-user limit on the calculate endpoint (it is cheap, and the request size is capped at 100 KB); `npm start` serves only the API, so hosting the built web app needs a static host or a small addition; a picture whose owner signs out stays on disk until it is read, removed or 24 hours pass.
- Later, before real users: HTTPS everywhere, a persistent session store, audit logging, and a review of the AI provider's data retention terms.

## Roadmap

These are candidate features after the prototype, unordered and undated until we pick them; each moves into the requirements table when chosen.

- **Invoice history:** save each result with its image and date, and list past invoices per user.
- **Database and persistent sessions:** replace in-memory storage (for example PostgreSQL), so restarts keep users signed in.
- **Running balance:** combine several invoices into one total net position.
- **Currencies:** detect and show the currency, and keep totals per currency.
- **Export:** download results as CSV or PDF.
- **Batch upload:** several invoices at once.
- **Deployment:** host the app with HTTPS and a real SMS sender number.
- **Mobile app:** wrap the responsive web app with Capacitor for iOS and Android, adding native camera capture. The icon and splash sources it needs are already in `client/assets` (see Branding).

## Open questions

The build can start without these answers; each has a default assumed in brackets.

- [ ] Is the superadmin and agent setup from the whiteboard part of this prototype, or the next phase? (Assumed: next phase; the prototype builds single-user upload and calculation first.)
- [ ] On the whiteboard, what do the crossed-out and ticked amounts mean, and is the total per agent or across all agents?
- [ ] Which currency or currencies do the invoices use? (Assumed: one currency, symbol shown if printed.)
- [ ] Which SMS provider and which countries should codes go to? (Assumed: Twilio, any country.)
- [ ] Is the net always Debit minus Credit, or can the invoice say which side wins? (Assumed: Debit minus Credit.)
- [ ] Can you share 2 or 3 sample invoice photos so the AI can be tested against real layouts? (Assumed: test with generated samples.)
- [ ] Should results be saved in the prototype, or only shown? (Assumed: only shown.)

## Changelog

| Date | Version | Change |
| --- | --- | --- |
| 2026-11-16 | 0.1 | First draft of the prototype spec. |
| 2026-11-16 | 0.2 | SMS login built (AUTH-1 to AUTH-5). Added `GET /api/auth/me`, the `AUTH_SECRET` setting and the specific rate limits; clarified 429 and lockout behaviour. |
| 2026-11-16 | 0.3 | Login UI made mobile first (touch targets, numeric keypad, SMS autofill); web plus iOS and Android via Capacitor recorded as the platform plan; testing rule: UI, client and server tests for every feature. |
| 2026-11-16 | 0.4 | Product named Ledgerly. Added the Branding section (logo, palette, icons, accessibility), the web app manifest, and icon and splash sources for the Capacitor wrapper. |
| 2026-11-16 | 0.5 | Rebranded to a pink palette (pink, green, white) with a matching dark theme, requested by the manager. New logo colours, icons, splash and favicon; no layout or behaviour changes. |
| 2026-11-16 | 0.6 | Invoice picture upload built (UP-1 to UP-3): upload, fetch and delete endpoints, size and type checks, per-user storage with automatic deletion, upload screen with camera, preview, progress, replace and remove. AI-4 changed: pictures are stored briefly instead of kept only in memory. Added 404 and 415 status codes and the `UPLOAD_*` settings. |
| 2026-11-16 | 0.7 | AI amount extraction built (AI-1 to AI-4): `POST /api/invoices/:id/extract`, Claude vision provider with a deterministic mock mode, HEIC to JPEG conversion, strict output validation, exact decimal amounts (strings, not numbers), line items, warnings and confidence, per-user hourly limit, picture deleted after reading. Web: Read amounts, loading and cancel, editable Debit and Credit with checks, type by hand. Endpoint changed from a multipart `extract` to `:id/extract` on the already uploaded picture. |
| 2026-11-16 | 0.8 | Final amount calculation and result screen built (CALC-1 to CALC-3, RES-1, RES-2). New shared `@ledgerly/money` package (exact BigInt minor units, signed line items, formatting) used by the server and the web app. `POST /api/invoices/calculate` now built, also accepts a list of signed line items and returns `signedNet` and `lineCount`. Web: Calculate final amount button, result screen with live recalculation, breakdown, copy, back, new invoice. Calculation rules extended (zero, large numbers, rounding, formatting). Request body too large now answers 413. |
| 2026-11-16 | 0.9 | End-to-end testing, polish and hardening (no new features). Full-journey browser tests on phone, small phone and desktop with error paths, keyboard-only and enlarged-text runs. Browser Back and Forward now move between the amounts and the final amount; focus returns to the upload heading when starting again; signing out clears the amounts kept in the browser and signs out other tabs; large text no longer overlaps. API answers carry no-store and nosniff headers, unknown `/api` addresses answer JSON 404, `TRUST_PROXY` and `NODE_ENV` settings added, provider errors are logged without keys, empty upload folders are swept, start-up warns about unsafe production settings. README rewritten as a quick start. |
