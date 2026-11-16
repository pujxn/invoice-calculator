# Invoice Calculator: Product Spec

> The live, editable copy of this spec is the Claude Doc
> [Invoice Calculator: Product Spec](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs).
> This file is a snapshot of it for the repo. Change the doc first, then update this file and the changelog.

Version 0.4 · 2026-11-16

## Overview

Invoice Calculator reads a photo of a standardised invoice showing a Debit amount and a Credit amount, and tells the user the final net amount and whether it is a net Debit or a net Credit. This spec is the source of truth for the product; every change to scope is recorded here first.

**Users:** people who receive simple standardised invoices and need the net figure quickly, signing in with their mobile number.

**Prototype goals**

- Sign in with a one-time code sent by SMS, no passwords.
- Upload or take a photo of an invoice.
- AI image recognition reads the Debit and Credit amounts.
- The user checks and corrects the amounts, then sees the final net amount.
- Runs locally with no paid credentials (mock SMS and manual entry), and with real SMS and AI once keys are added.

**Not in the prototype:** saved history, multiple currencies, multi-line invoices, user profiles, a production database, deployment, and native mobile apps. These are tracked in the Roadmap.

## User flow

A user goes from phone number to net result in five screens, with a chance to fix the AI's reading before the result is final.

1. **Enter phone number.** The user types a mobile number in international format (for example +44 7700 900123) and taps Send code.
2. **Enter code.** A 6-digit code arrives by SMS. The user enters it; a wrong code shows an error, and Resend is available after 30 seconds.
3. **Upload invoice.** The user picks or takes a photo (JPEG, PNG, WebP or HEIC, up to 10 MB) and sees a preview.
4. **Review amounts.** AI reads the Debit and Credit amounts and pre-fills two fields. The user can edit either field, clear one, or upload a different photo.
5. **See result.** The app shows the net amount and labels it Net Debit, Net Credit, or Balanced, with the working (Debit minus Credit). The user can start a new invoice or sign out.

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
| AI-1 | Extraction | A vision AI model returns the Debit and Credit amounts as numbers, or null when a value is not on the invoice. | Planned |
| AI-2 | Extraction | The response includes a confidence note and the currency if one is shown. | Planned |
| AI-3 | Extraction | If the AI is not configured or fails, the user can still type the amounts by hand. | Planned |
| AI-4 | Extraction | Uploaded images are kept only briefly: deleted when the user removes or replaces them, and automatically after 24 hours (`UPLOAD_TTL_HOURS`). The extraction step should also delete the image once it has been read. (Changed in 0.4: images are now stored so they can be uploaded and fetched.) | Planned |
| CALC-1 | Calculation | User can edit both amounts before calculating; amounts must be 0 or more with up to 2 decimals. | Planned |
| CALC-2 | Calculation | Net = Debit minus Credit, using the rules in Calculation rules. | Planned |
| CALC-3 | Calculation | Calculation uses exact decimal maths (cents), not floating point. | Planned |
| RES-1 | Result | Shows the net amount, its label (Net Debit, Net Credit, Balanced) and the working. | Planned |
| RES-2 | Result | User can start a new invoice without signing in again. | Planned |

## Calculation rules

The final amount is Debit minus Credit: a positive result is a Net Debit, a negative result is a Net Credit shown as a positive number, and zero is Balanced.

```
net = Debit - Credit
```

- A missing value counts as 0, so an invoice with only a Debit gives a Net Debit of that amount, and only a Credit gives a Net Credit.
- If both values are missing, the app asks the user to enter at least one before calculating.
- Negative inputs are not allowed; a minus sign read from the image is shown to the user to confirm.
- Results are rounded to 2 decimal places.

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
- **Tests:** Node's built-in test runner for the calculator and auth logic, and Playwright UI tests (`e2e/`) for every feature, with screenshots of each screen kept in `docs/screenshots/`.

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
| `POST /api/invoices/extract` | multipart form, field `image` | `{ debit, credit, currency, confidence, provider }` (amounts are numbers or null) |
| `POST /api/invoices/calculate` | `{ debit, credit }` | `{ debit, credit, net, type }` where `type` is `debit`, `credit` or `balanced` and `net` is never negative |

Errors use HTTP status codes (400 bad input, 401 not signed in, 404 not found or not yours, 413 file too large, 415 not a supported picture, 429 too many requests, 502 AI or SMS provider failed) with a body of `{ error: "message" }`. A 429 from the auth calls also carries `retryAfterSeconds` and a `Retry-After` header. A wrong code is 401; after 5 wrong tries the code is locked and further tries get 429 until a new code is requested.

A `GET /api/health` endpoint (no auth) reports that the server is up and which providers are configured.

## Configuration

The prototype runs with no settings at all: codes print to the server log and amounts are typed by hand. Setting the variables below in `server/.env` switches on real SMS and AI.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 4000 | Port for the Node API |
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

## Security and privacy

The prototype keeps no invoice images and stores codes only as hashes, but it is not production-ready until the items marked later are done.

- Codes are stored hashed, compared in constant time, expire after 5 minutes and lock after 5 wrong tries.
- Code requests are rate limited per phone number (one per 30 seconds, 5 per hour) and per IP address (20 per 15 minutes); code checks are limited to 40 per IP per 15 minutes. This limits SMS cost abuse and guessing.
- Codes are keyed hashes (HMAC-SHA256 with a server secret) tied to the phone number, and are single use.
- Session tokens are random 32-byte values held in server memory (only their SHA-256 is kept); restarting the server signs everyone out. The web app keeps the token in the browser's localStorage, so a script injected into the page could read it; moving to an HttpOnly cookie is a later hardening item.
- Uploaded pictures are checked by their bytes (not their name), stored under a hashed owner folder with random file names, readable only by their owner, and deleted after 24 hours or when removed. They are sent only to the configured AI provider.
- API keys live in environment variables and never reach the browser.
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
- **Mobile app:** a native or installable app with camera capture.

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
| 2026-11-16 | 0.4 | Invoice picture upload built (UP-1 to UP-3): upload, fetch and delete endpoints, size and type checks, per-user storage with automatic deletion, upload screen with camera, preview, progress, replace and remove. AI-4 changed: pictures are stored briefly instead of kept only in memory. Added 404 and 415 status codes and the `UPLOAD_*` settings. |
