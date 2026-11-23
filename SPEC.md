# Ledgerly: Product Spec

> The live, editable copy of this spec is the Claude Doc
> [Ledgerly: Product Spec](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs).
> This file is a snapshot of it for the repo. Change the doc first, then update this file and the changelog.

Version 0.16 · 2026-11-23

## Overview

Ledgerly (the working title was Invoice Calculator) reads a photo of a standardised invoice showing a Debit amount and a Credit amount, and tells the user the final net amount and whether it is a net Debit or a net Credit. This spec is the source of truth for the product; every change to scope is recorded here first.

**Users:** two roles, both signing in with their mobile number. **Agents** process invoices (read, check, calculate) and each keep their own list. A **superadmin** adds and removes agents and sees every agent's list and totals, and an overall total.

**Prototype goals**

- Sign in with a one-time code sent by SMS, no passwords.
- Upload or take a photo of an invoice.
- The Debit and Credit amounts are read from the picture, by free local OCR or by AI (the user switches between them).
- The user checks and corrects the amounts, then sees the final net amount.
- Runs locally with no paid credentials (console SMS and free local OCR), and with real SMS and AI once keys are added.

**Not in the prototype:** open sign-up (only added numbers can sign in), other currencies (Ledgerly works in Indian rupees only), line items (only the Debit and Credit amounts are read and calculated; invoice lines are not read or totalled), user profiles, a production database, deployment, and native mobile apps. These are tracked in the Roadmap.

## User flow

An agent goes from phone number to net result in five screens, with a chance to fix the AI's reading before the result is final. (A superadmin signs in the same way, steps 1 and 2, and lands on the Agents page instead; see Roles.)

1. **Enter phone number.** The user types a mobile number in international format (for example +44 7700 900123) and taps Send code. A number that is not a superadmin's and has not been added as an agent is told "This number is not registered with Ledgerly. Ask your administrator to add it." and no text is sent.
2. **Enter code.** A 6-digit code arrives by SMS. The user enters it; a wrong code shows an error, and Resend is available after 30 seconds.
3. **Upload invoice.** The user picks or takes a photo (JPEG, PNG, WebP or HEIC, up to 10 MB) and sees a preview.
4. **Review amounts.** The user presses Read amounts; AI reads the Debit and Credit amounts and pre-fills two fields, with a confidence note and anything to double check. The user can edit either field, clear one, type the amounts by hand instead, or upload a different photo.
5. **See result.** The user presses Calculate final amount. The app shows the net amount large, labelled Net Debit, Net Credit, or Balanced, with the working (Debit minus Credit) and a breakdown of the inputs. Debit and Credit can be changed on this screen and the result updates as they are typed. The user can copy the result, go back to the invoice (the browser's Back button does the same), start a new invoice (no new sign-in), or sign out. A reload at any step keeps the user's place and edits; signing out clears them from the browser.
6. **History.** Every invoice that reaches the final amount is saved by itself (a note on the screen says so, with a link). The History page, opened from the header, lists saved invoices newest first. The user can search by amount or by the words debit, credit or balanced, show only Net Debit, Net Credit or Balanced, and limit the list to a range of dates. Opening an entry shows its final amount, the two amounts, when it was saved, how it was read and the picture reference, and lets the user copy the result or delete the entry.

## Roles: agents and superadmin

This is the whiteboard photo (IMG_0688) turned into requirements (ROLE-1 to ROLE-8 below). What the sketch showed and how it was built:

- **Superadmin adds agents** by name and mobile number ("Add Agent: mobile, name"); only added numbers can sign in. Built: the Agents page.
- **Agents sign in** with mobile number and OTP, then see two options, Add (new invoice) and List. Built: the header has **New invoice** and **History** (the saved invoice history is the agent's list).
- **Upload screen** has Browse and Submit; the image goes to AI for image-to-text. Built as the existing upload, read and review screens.
- **Results list** shows each extracted amount, with a pop-up to correct a value. Built: History lists each saved invoice; opening one lets the agent correct it or delete it.
- **Per-agent figures:** each agent has a Debit and Credit pair, for example 50,000 and 10,000. Built: each agent's Debit total, Credit total and net, on their History page and on the superadmin's Agents page.
- **Totals:** a column of amounts adds up to one total, with some lines crossed out and one ticked. Built: the overall total across all agents. The crossed-out and ticked marks are still not understood and are not built (see Open questions).

**How roles work.** The role comes from the phone number. Numbers listed in `SUPERADMIN_PHONES` are superadmins. Every other number must have been added by a superadmin as an agent to sign in. The role is looked up on every request, so removing an agent signs them out at once. Agents see New invoice and History; a superadmin sees only Agents (and the pages under it). An agent who opens a superadmin address, or the other way round, is sent to their own home page, and the API answers 403.

**Where the data lives.** The agents (name, number, when added or removed) are in one JSON file (`AGENTS_FILE`). An agent's invoices are the saved invoice history records they own (`HISTORY_FILE`, see HIST-1 to HIST-7): the server sets each record's `agentId` to the agent's number. There is no separate store of invoices for agents. Totals are added up exactly from those records (BigInt rupee units), never rounded, and a superadmin's overall total includes agents who were removed, so money is never dropped from the total.

**Removing an agent** stops them signing in and ends any open session at once. Their saved invoices stay on file and in the totals, and their row moves to Removed agents. Adding the same number again (with any name) brings the agent back with the list they had.

## Features and requirements

The prototype has 32 requirements across seven areas; the Status column tracks each one as it is built.

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
| AI-1 | Extraction | A reader (a vision AI model, Claude, with the model set by `ANTHROPIC_MODEL`; or the free local OCR, see OCR-1 to OCR-6) reads the uploaded picture and returns the Debit and Credit amounts, in Indian rupees, as exact decimal strings (for example `"1250.50"` or `"12.345"`; every decimal printed is kept), or null when a value is not on the invoice. Only the Debit and Credit amounts are read: line items are not read or returned, and an AI answer that includes them is rejected. The answer is checked against a strict schema; anything off-shape is rejected. An amount that could be read two ways (`1,234`, `12.345`), is negative, or is beyond the limits (see Calculation rules) is returned as null with a warning, never guessed; a plain number with more decimals (`1234.567`, `0.001`) is kept, not blanked. HEIC is converted to JPEG first. | Built |
| AI-2 | Extraction | The response includes a confidence level (high, medium, low), a confidence flag for each amount (`amountConfidence`, see OCR-7), a short note, warnings for anything to check, and the currency, which is always INR (the AI is told every invoice is in rupees, and says in the note if one clearly is not). | Built |
| AI-3 | Extraction | If the AI is not configured (it is then shown as unavailable and local OCR still works; mock mode shows demo values), is busy, times out or fails, the user sees a clear message, can retry, or can type the amounts by hand. Unreadable pictures, missing amounts and ambiguous values are reported the same way. | Built |
| AI-4 | Extraction | Uploaded images are kept only briefly: deleted when the user removes or replaces them, automatically after 24 hours (`UPLOAD_TTL_HOURS`), and as soon as the amounts have been read (or the user chooses to type them). A failed reading keeps the picture so the user can retry. The image is sent only to the AI provider, resized and stripped of location data. | Built |
| OCR-1 | Local OCR | A free reader that needs no key and no network: the picture is converted to JPEG (HEIC supported), straightened if tilted (and turned upright if upside down or sideways), cut out of the desk around a photographed page, and read by Tesseract (`tesseract.js`, WebAssembly) up to five times with different clean-ups (plain; light evened out and ruled lines removed; black and white; local contrast; hard contrast), stopping once two readings agree. Each amount found is then read again three times as a digits-only close-up. The English language data is bundled (`@tesseract.js-data/eng`), so there is no download at first use. It returns the same answer shape as the AI (Debit, Credit, confidence, notes), so the screens need no special case. | Built |
| OCR-2 | Local OCR | Reading is tolerant of how an invoice prints amounts: `Debit:`, `DEBIT -`; a stray currency mark (`₹`, `Rs.`, `INR`, a trailing `/-`) is ignored if present; standard and lakh grouping (`12,34,567.50`); a comma is always a thousands separator in rupees (`45,000` is 45000); and OCR letter-for-digit slips (`O` for 0, `l` for 1, `S` for 5) only inside number-shaped words. | Built |
| OCR-3 | Local OCR | Honest confidence: only the printed Debit and Credit amounts are read, as plain numbers with no currency sign expected (the lines of a table are ignored). The amount is found beside its label, or under it (label on one line and amount on the next, or `Debit  Credit` headings with the amounts below); an amount beside its label wins over one below. Loose handwritten spellings of the labels count (`Cred`, `Debi`), real words such as Debt do not. An amount is filled in only when at least two readings agree on it, at least one of them a whole-page reading (a digits-only close-up can confirm an amount but never invent one), and it beats every other reading. Readings that disagree, or tie, leave the box empty with a note and the Please check list. A picture with no Debit or Credit label, or one too noisy to read, is reported as not an invoice. Never guessed. Accuracy is measured with `server/bench/` on 96 printed and handwriting-style amounts (see docs/OCR-ACCURACY.md). The AI reader remains the more accurate choice for messy handwriting. | Built |
| OCR-4 | Local OCR | One shared worker, started on first use and stopped after a minute idle; readings run one at a time with a short queue; each is cut off after `OCR_TIMEOUT_SECONDS` (default 45) or when the user cancels, and the worker is restarted. The picture is deleted after reading, as for the AI. | Built |
| OCR-5 | Local OCR | Optional back-up, off by default: with `OCR_FALLBACK_TO_CLAUDE=1` and an API key, a low-confidence or empty OCR answer is read by the AI instead, and the result says which reader produced it. | Built |
| OCR-6 | Local OCR | Reading method switch: the upload screen has a "Read with" switch (Local OCR, AI (Claude)), remembered for the browser tab, sent with each reading request. The server only accepts methods it has: AI is listed as unavailable with the reason when there is no key (409 `method_unavailable` if asked anyway). The result screen says which reader was used. With `VISION_PROVIDER=mock` there is nothing to switch and the switch is hidden. | Built |
| OCR-7 | Local OCR | Confidence flag on each amount: the answer has `amountConfidence: { debit, credit }`, each `high`, `low` or null (empty box). OCR says `high` only when at least two whole-page readings and two close-ups agree, no reading saw a different number, and the engine's own word confidence is at least 60; otherwise `low`. Readers that give one level for the whole picture (AI, demo values) are flagged `high` for high and `low` for anything less. The review and result screens show a badge beside each amount: High confidence (green) or Low confidence (pink, with "Please double-check this amount against your picture" and a pink outline; never yellow). The flag goes once the person changes that amount. The overall `confidence` for OCR is high when every amount is high, medium when some are low, low when none was read. | Built |
| CALC-1 | Calculation | User can edit both amounts before calculating, and again on the result screen; any amount may be typed: 0 or more, with any number of decimals (up to 12), up to 15 digits before the decimal point, in rupees. Thousands commas (`1,250.50`, lakh style `12,50,000`), `1e3` style, and a pasted `₹`, `Rs.` or `/-` are accepted. Negatives, other currency signs and non-numbers get a clear message, and the limits are stated next to the boxes. | Built |
| CALC-2 | Calculation | Net = Debit minus Credit, using the rules in Calculation rules. Only a Debit and a Credit are calculated; there are no line items. | Built |
| CALC-3 | Calculation | Calculation uses exact decimal maths (BigInt in units of 10^-12 rupee, amounts as decimal strings), not floating point, and never rounds: the result keeps every decimal. One shared module is used by the server and the web app. | Built |
| RES-1 | Result | Shows the net amount in rupees (₹, lakh grouping), its label (Net Debit, Net Credit, Balanced) and the working, with a breakdown of the inputs. When the exact result has more than 2 decimals, the big figure is shown rounded to 2 and a note gives the exact amount. Debit and Credit can be edited on the screen and the result updates as they are typed. The result can be copied. | Built |
| RES-2 | Result | User can start a new invoice without signing in again. | Built |
| HIST-1 | History | Every invoice that reaches a valid final amount is saved automatically as one record: Debit, Credit, net, type (debit, credit or balanced), the time it was saved, how it was read (`ocr`, `claude`, `mock` or `manual`) and a reference to the picture (`imageRef`, the id of the picture that was read; empty if the amounts were typed with no picture). The server works out the net and type itself from the two amounts, never from the browser. Amounts are exact decimal strings in rupees. | Built |
| HIST-2 | History | Corrections made on the final amount screen update the same record, never add a second. Saving the same picture twice is one record. A correction typed just before leaving the screen is still sent, and the History page waits for it. If saving fails, the screen says so and offers Try again; the result still works. | Built |
| HIST-3 | History | A History page lists the signed-in user's saved invoices, newest first, 20 at a time with Show more. Each row shows the date and time, Net Debit, Net Credit or Balanced, the net amount and both amounts. | Built |
| HIST-4 | History | Search and filter: text search over the amounts (commas, `₹` and spaces ignored) and the words debit, credit, balanced (also matches the reader); a Show filter for Net Debit, Net Credit or Balanced; From and To dates (whole local days, both included). Filters combine; a backwards date range is flagged, not searched; Clear search and filters resets them. | Built |
| HIST-5 | History | Opening an entry shows the final amount and working exactly as on the result screen, the two amounts, when it was saved (and last changed), how it was read and the picture reference. The picture itself is not kept: it is deleted as soon as it is read (AI-4), so the reference only records where the amounts came from. The user can copy the result and delete the entry (after being asked). | Built |
| HIST-6 | History | History is private: every route needs a signed-in user and only reaches that user's own records; another user's id answers 404 like an id that does not exist. History is kept in a file on the server (`HISTORY_FILE`) and survives restarts. | Built |
| HIST-7 | History | The storage is one module (`server/src/history/store.js`) with a small interface (save, get, list, filter, update, remove). Records carry an optional `agentId` (empty for now, and not settable through the API) and are keyed by owner, so agent and superadmin roles can attach later without a second invoice store. | Built |
| ROLE-1 | Roles | A phone number is one of two roles: superadmin (listed in `SUPERADMIN_PHONES`) or agent (added by a superadmin). Any other number cannot sign in: asking for a code is refused (403) before any text is sent, and so is checking a code. `GET /api/auth/me` returns `{ phone, name, role, expiresAt }`. | Built |
| ROLE-2 | Roles | The role is looked up on every request. Removing an agent ends their open session at once (their next request is 401) and stops new sign-ins. | Built |
| ROLE-3 | Roles | A superadmin adds an agent by name (1 to 60 characters) and mobile number (E.164). A number that is a superadmin or an active agent is refused (409). Adding a removed agent's number brings them back with their earlier list. | Built |
| ROLE-4 | Roles | A superadmin removes an agent, after being asked. The agent's saved invoices stay on file and in the totals. | Built |
| ROLE-5 | Roles | The Agents page (superadmin only) shows the overall total, then each agent's name, number, Debit total, Credit total, net (Net Debit, Net Credit or Balanced) and number of invoices; removed agents are listed apart. | Built |
| ROLE-6 | Roles | A superadmin opens one agent to see that agent's totals and saved invoices, newest first, 50 at a time with Show more. Read only: the superadmin cannot change an agent's invoices. | Built |
| ROLE-7 | Roles | Only agents process invoices: the upload, reading, calculate and History routes are agent-only (403 for a superadmin), and each agent reaches only their own records. An agent's History page shows their total (Debit, Credit, net, count) over every saved invoice, not just the page on screen. | Built |
| ROLE-8 | Roles | Agents and superadmin are kept apart on screen: each role sees only its own navigation, and opening the other role's address goes to home. Both roles use the same responsive layout (phone to desktop), pink, green and white theme with dark mode, and rupees with lakh grouping. | Built |

## Calculation rules

The final amount is Debit minus Credit: a positive result is a Net Debit, a negative result is a Net Credit shown as a positive number, and zero is Balanced.

```
net = Debit - Credit
```

- A missing value counts as 0, so an invoice with only a Debit gives a Net Debit of that amount, and only a Credit gives a Net Credit.
- If both values are missing, the app asks the user to enter at least one before calculating.
- Negative inputs are not allowed; a minus sign read from the image is shown to the user to confirm.
- **Any amount is accepted.** An amount may have any number of decimals (up to 12), so `12.345`, `0.001` and `2.675` are valid, and is read exactly. Nothing is rounded in the maths: the net keeps every decimal (`12.345 - 0.001 = 12.344`).
- **Rounding is for showing only.** The big figure on the result screen is the exact net rounded to 2 decimal places (half away from zero: 12.344 shows as 12.34, 2.675 as 2.68). When that changes the figure, a note under it says "Shown rounded to 2 decimal places. The exact amount is ₹12.344.". The working line, the breakdown table, the copied text and the API's `net` show every decimal, so the working adds up. A result that is exactly 2 decimals or fewer shows no note.
- **Limits.** One amount may have at most 15 digits before the decimal point (up to ₹99,99,99,99,99,99,999.99 in lakh style) and at most 12 decimal places (trailing zeros do not count), and its text at most 100 characters. Trailing zeros are ignored (`5.000000000000000` is 5). The limits are written under the Debit and Credit boxes and returned in API error messages. Amounts in scientific notation (`1e3`, `1.5e-3`) are read exactly.
- **Not accepted**, each with a clear message: negatives, other currency signs ($ £ €), anything that is not a number, more than 12 decimals, more than 15 whole digits, and a JSON number in the API (send text).
- Zero is a real amount: a Debit of 0 and a Credit of 0 is Balanced 0.00, while two blank boxes is "enter at least one amount".
- **Rupees only.** Ledgerly works in Indian rupees (INR). Amounts are shown with the ₹ sign, 2 decimals and lakh grouping (12,34,567.50). A pasted `₹`, `Rs.`, `INR` or `/-` is ignored when typing; other currency signs are refused with a message. There is no currency choice and no conversion.

**No line items.** Ledgerly works on one Debit amount and one Credit amount per invoice. Lines of an invoice are not read from the picture and not calculated, in the AI reader, the OCR reader, the API or the screens.

| Debit | Credit | Result |
| --- | --- | --- |
| 1,250.00 | 400.00 | Net Debit ₹850.00 |
| 300.00 | 975.50 | Net Credit ₹675.50 |
| 500.00 | 500.00 | Balanced ₹0.00 |
| 720.00 | (none) | Net Debit ₹720.00 |
| (none) | 99.99 | Net Credit ₹99.99 |
| 12.345 | (none) | Net Debit ₹12.35 (exact ₹12.345) |
| 10.005 | 0.004 | Net Debit ₹10.00 (exact ₹10.001) |
| 0.001 | 0.002 | Net Credit ₹0.00 (exact ₹0.001) |
| 12,34,567.891 | 500 | Net Debit ₹12,34,067.89 (exact ₹12,34,067.891) |

## Architecture and tech stack

A React web app talks to one Node API, and the API talks to an SMS provider and a vision reader (free local OCR, or the Claude AI, chosen by a setting and, per picture, by the user) that can each be swapped, so either can be swapped without changing the app. (The architecture diagram is in the live doc.)

```
React web app (Vite)  --JSON-->  Node API (Express)  --code-->   SMS provider (console | twilio)
                                   auth, invoices,   --image-->  Vision reader (ocr | claude | mock)
                                   calculator, roles, agents (JSON file),
                                   history (JSON file)
```

- **Client:** React 18 with Vite, plain CSS, mobile first (touch-sized controls, numeric keypad, SMS code autofill). The product runs on web and mobile: the same responsive web app is wrapped with Capacitor 7 as an iOS and Android app (`client/ios`, `client/android`; app name Ledgerly, app id `com.ledgerly.app`).
- **Server:** Node 20+ with Express; multer for uploads; the Anthropic SDK for Claude vision.
- **Repo:** one GitHub repo, `invoice-calculator`, with `client/` and `server/` folders and one `npm run dev` that starts both.
- **Tests:** Node's built-in test runner for the server (calculator, auth), Vitest and Testing Library for React components, and Playwright UI tests (`e2e/`, with axe accessibility checks) for every feature. Every feature ships with tests at the levels it touches.
- **Installable:** the web app has a manifest and icons so it can be added to a home screen, and `client/assets` holds the icon and splash sources Capacitor uses (`npm run native:assets` turns them into every app icon and splash screen).
- **Mobile apps (Capacitor 7):**
  - *Shell.* The app loads a built copy of the web app from the phone (`capacitor://localhost` on iOS, `https://localhost` on Android). The iOS project uses Swift Package Manager (no CocoaPods). Native plugins: Camera, Status Bar, Splash Screen, Keyboard.
  - *Server address.* The web app calls `/api/...` on its own host. The app has no server of its own, so its build is given an address (`VITE_API_BASE_URL`, set by `npm run native:*`). A development build uses the computer's Wi-Fi address and the API port, so an emulator and a phone can both reach it. A production build must be given an `https` address and refuses `http`.
  - *Sign-in and CORS.* The session token travels in the `Authorization` header (never a cookie). The API answers cross-origin checks only for the app origins and the origins in `CORS_ORIGINS`, with `Authorization` and `Content-Type` allowed, no credentials.
  - *Cleartext.* Plain `http` is allowed only for development: Android debug builds (`src/debug/AndroidManifest.xml`) and development `cap sync` settings, and on iOS only to local-network addresses (`NSAllowsLocalNetworking`). Release builds use `https` only.
  - *Camera.* **Take photo** and **Choose from photos** use the native camera and picker and return a JPEG that goes through the normal upload. Where the plugin is missing (a browser) the web file inputs are used.
  - *Look and feel.* Status bar style follows the light or dark theme (and Android takes the page background colour), the splash screen is hidden once the page draws, safe areas use `env(safe-area-inset-*)`.
  - *Not covered yet.* Android SMS code autofill (iOS uses `autocomplete="one-time-code"`), push notifications, deep links and offline use. The sign-in token stays in web storage, not the phone's secure storage.

## Branding

The product is called **Ledgerly**. The logo is a ledger mark (a vertical rule, a longer debit bar, a shorter green credit bar and a total line, which also reads as an L) next to the wordmark in Inter SemiBold, outlined so the SVGs need no fonts.

- **Files:** `client/public/brand/` holds the lockup and the mark, each in light and dark, plus the favicon, `apple-touch-icon.png` and the PWA icons. `client/assets/` holds the Capacitor sources: `icon-only`, `icon-foreground` and `icon-background` (1024 px) and `splash` and `splash-dark` (2732 px). A preview is in `docs/brand/logo-preview.png`.
- **Colour:** a pink UI with green and soft rose accents on white. Light theme: ledger pink `#c2185b` (primary, white text on it), blush white `#fff7fa` background, plum ink `#2b1020` text, credit green `#145c33` on `#e1f5e8` (success and credit), mint `#a6efc3` for the credit bar in the logo (dark logo: forest `#1a7a46`), and soft rose `#f0a3c3` for the header rule (decoration only). Dark theme: soft pink `#ff8fb8` on deep plum `#1c0f16`, with surfaces `#2a1822` and text `#fbeaf1`. The dark theme follows the device setting. Logo, icons and splash are generated from the palette by `npm run brand`.
- **Type:** Inter if installed, else the system font; no web font is downloaded.
- **Accessibility:** text and controls meet WCAG AA (4.5:1 text, 3:1 control outlines), buttons are at least 48 px tall, the logo has the alt text "Ledgerly", and focus rings are always visible. Contrast ratios of the colour tokens are checked by tests.
- **Where it shows:** browser tab title and icon, sign-in screen, the header of every signed-in page, and the SMS text ("Your Ledgerly code is ...").

## API endpoints

The Node server exposes JSON endpoints under `/api`; all except the two code calls (`request-otp`, `verify-otp`) need an `Authorization: Bearer <session token>` header. `request-otp` and `verify-otp` answer 403 `{ error }` for a number that is not a superadmin or an added agent. The invoice, calculate, history and `my-totals` routes are for agents; the `agents` routes are for the superadmin; the other role gets 403.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/auth/request-otp` | `{ phone }` | `{ ok: true, resendAfterSeconds: 30 }` |
| `POST /api/auth/verify-otp` | `{ phone, code }` | `{ token, expiresAt }` or 401 with `{ error }` |
| `POST /api/auth/logout` | none | `{ ok: true }` |
| `GET /api/auth/me` | none | `{ phone, name, role, expiresAt }` (`role` is `agent` or `superadmin`), used by the web app to check a stored session and choose the screens |
| `POST /api/invoices` | multipart form, field `image` | 201 `{ id, mimeType, size, createdAt, imageUrl }`; own pictures only |
| `GET /api/invoices/:id` | none | the same details, or 404 |
| `GET /api/invoices/:id/image` | none | the picture bytes, or 404 |
| `DELETE /api/invoices/:id` | none | `{ ok: true }`, or 404 |
| `GET /api/invoices/reading-methods` | none | `{ default, methods: [{ id, label, available, reason? }] }`, for the "Read with" switch (`ocr`, `claude`; `mock` alone in demo mode) |
| `POST /api/invoices/:id/extract` | optional `{ method: "ocr" \| "claude" }` (the server default if omitted; unknown is 400, not set up is 409) | `{ invoiceId, provider, model, imageDeleted, debit, credit, currency, confidence, amountConfidence, notes, warnings }`; amounts are decimal strings or null (no line items). Deletes the picture on success |
| `POST /api/invoices/calculate` | `{ debit, credit }` (text or null) | `{ debit, credit, net, netRounded, rounded, signedNet, type }`: all amounts are exact decimal strings in rupees, `debit` and `credit` are the two amounts, `net` is never negative and keeps every decimal (`"10.001"`), `netRounded` is the same rounded to 2 decimals for showing (`"10.00"`), `rounded` is true when those differ, `signedNet` is Debit minus Credit, and `type` is `debit`, `credit` or `balanced`. Needs a signed-in user. Amounts follow the rules above (any decimals up to 12, up to 15 whole digits); numbers instead of text, negatives, junk and amounts over the limits are refused (400) with a message |
| `POST /api/history` | `{ debit, credit, imageRef?, method? }` (amounts as text; `method` is `ocr`, `claude`, `mock` or `manual`, default `manual`) | 201 with the saved entry, or 200 if that picture (`imageRef`) was already saved (its record is updated). Only the amounts, `imageRef` and `method` are read; the net, type, owner, id and agent are decided by the server |
| `GET /api/history` | optional query: `q` (search text), `type` (`debit`, `credit`, `balanced`), `from` and `to` (a day `2026-11-19`, or a full time such as `2026-11-18T18:30:00.000Z`; both ends included), `limit` (default 50, at most 200), `offset` | `{ entries, total, limit, offset }`, newest first; `total` counts every match. A bad date, type or backwards range is 400 with `field` |
| `GET /api/history/:id` | none | one entry, or 404 |
| `PATCH /api/history/:id` | `{ debit, credit }` | the corrected entry (net and type follow), or 404; `createdAt` does not move |
| `DELETE /api/history/:id` | none | `{ ok: true }`, or 404 |
| `GET /api/my-totals` | none | An agent's own totals over every saved invoice: `{ count, debit, credit, net, signedNet, type }` (exact decimal strings; `net` never negative). Agents only |
| `GET /api/agents` | none | Superadmin only. `{ agents: [agent], total }` where `agent` is `{ phone, name, active, addedAt, removedAt, count, debit, credit, net, signedNet, type }` and `total` is `{ count, debit, credit, net, signedNet, type }` over every agent, removed ones included |
| `POST /api/agents` | `{ phone, name }` | Superadmin only. 201 `{ agent, restored: false }`; 200 `{ agent, restored: true }` for a removed agent added back; 400 for a bad number or name; 409 for a superadmin or an active agent |
| `GET /api/agents/:phone` | optional `limit` (default 50, at most 200) and `offset` | Superadmin only (the `+` of the number is sent as `%2B`). `{ agent, entries, total, limit, offset }`: the agent's totals cover every invoice, `entries` is one page, newest first, as in `GET /api/history` without the owner. 404 for an unknown number |
| `DELETE /api/agents/:phone` | none | Superadmin only. `{ agent }` with `active: false`; 409 if already removed; 404 if unknown |

An entry is `{ id, agentId, createdAt, updatedAt, debit, credit, net, netRounded, type, imageRef, method }`: amounts are exact decimal strings, `net` is never negative, and the owner's phone number is never sent back.

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
| `VISION_PROVIDER` | `ocr` | The default reader: `ocr` (free, local, the default even with a key), `claude`, or `mock` (demo numbers). The switch can change it per picture |
| `OCR_TIMEOUT_SECONDS` | 45 | One local OCR reading is abandoned after this long |
| `OCR_FALLBACK_TO_CLAUDE` | off | `1` lets the AI read when OCR is not sure (needs a key) |
| `ANTHROPIC_API_KEY` | none | Key for Claude vision |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model used for extraction |
| `ANTHROPIC_EFFORT` | `medium` | How hard the model thinks (`low` to `max`, or `none`) |
| `ANTHROPIC_TIMEOUT_SECONDS` | 60 | One AI call is abandoned after this long |
| `ANTHROPIC_FALLBACKS` | none | `default` lets the API retry a declined request on another model |
| `EXTRACT_PER_USER_PER_HOUR` | 30 | Readings one user can start per hour |
| `HISTORY_FILE` | `server/data/history.json` | The file where saved invoice history is kept (created on the first save, ignored by git). `memory` keeps history only until the server stops |
| `SUPERADMIN_PHONES` | demo number `+919999900000` for a local demo, else none | Mobile numbers (comma separated, any spacing) that sign in as superadmin. The demo number is used only when this is unset, `NODE_ENV` is not `production` and `SMS_PROVIDER` is `console`, so real texts never go to it; the server prints it at start-up. Numbers that are not valid are listed in a start-up warning |
| `AGENTS_FILE` | `server/data/agents.json` | The file the agents a superadmin adds are kept in (created on the first change, ignored by git). `memory` keeps them only until the server stops |
| `CORS_ORIGINS` | none | Extra origins (comma separated) allowed to call the API from a browser. The iOS and Android app origins are always allowed; `*` is refused |

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
- Saved history holds the Debit, Credit and net of each invoice, the time, how it was read and the id of the picture that was read, in one JSON file on the server (`HISTORY_FILE`, written through a temporary file and a rename, mode 0600). It holds no picture and no phone number apart from the owner key; routes only reach the signed-in user's own records. The file is not encrypted, so keep the server's disk private; a database replaces it before real users.
- Signing out (or the session ending, here or in another tab of the same browser) removes the sign-in token and the amounts and picture reference kept for the current tab.
- Start-up warns when `NODE_ENV=production` is combined with console SMS (anyone who can read the log can sign in), demo-value readings (`VISION_PROVIDER=mock`, users would see made-up amounts) or no `AUTH_SECRET`.
- Only superadmin numbers and added agents can sign in; the role is checked on every request, so removing an agent or a superadmin number takes effect at once. Asking for a code for an unregistered number is refused with a clear message (this tells a visitor whether a number is registered, which is accepted for a small closed group and is what lets the page say so; the per-number and per-IP limits still apply). A superadmin cannot read pictures or change an agent's invoices; an agent reaches only their own records.
- The agents file and the history file are plain JSON on the server (mode 0600, not encrypted), written whole after every change by one server process; running two servers on the same files would lose changes.
- Known gaps, not fixed in the prototype: the session token is in `localStorage` (script injection could read it); sessions, codes and rate-limit counters are in memory, so they reset on restart and are not shared between several server processes; there is no per-user limit on the calculate endpoint (it is cheap, and the request size is capped at 100 KB); `npm start` serves only the API, so hosting the built web app needs a static host or a small addition; a picture whose owner signs out stays on disk until it is read, removed or 24 hours pass.
- Later, before real users: HTTPS everywhere, a persistent session store, audit logging, and a review of the AI provider's data retention terms.

## Roadmap

These are candidate features after the prototype, unordered and undated until we pick them; each moves into the requirements table when chosen.

- **History extras:** keeping a small copy of the picture with each entry (today only a reference is kept, because pictures are deleted once read), export, and totals over a filtered range.
- **Roles extras:** per-agent date filters and export for the superadmin, a superadmin who also processes invoices, more than one level of admin, and moving agents and history into a database so several servers can share them.
- **Database and persistent sessions:** replace in-memory storage (for example PostgreSQL), so restarts keep users signed in.
- **Running balance:** combine several invoices into one total net position.
- **Export:** download results as CSV or PDF.
- **Batch upload:** several invoices at once.
- **Deployment:** host the app with HTTPS and a real SMS sender number.
- **Mobile app stores:** the Capacitor wrapper and native camera exist (see Architecture). Still to do: choose the final app id, store accounts and listings, signed release builds, secure token storage and Android SMS autofill.

## Open questions

The build can start without these answers; each has a default assumed in brackets.

- [x] Is the superadmin and agent setup from the whiteboard part of this prototype, or the next phase? (Decided: build it now; see Roles.)
- [ ] On the whiteboard, what do the crossed-out and ticked amounts mean? (Not built. The total is built both ways: per agent and across all agents. Agents can delete an invoice from their list; it then no longer counts.)
- [ ] Should a superadmin also be able to process invoices, and should they be able to correct or delete an agent's invoice? (Assumed: no to both. Read only.)
- [x] Which currency or currencies do the invoices use? (Decided: Indian rupees only, shown as ₹ with lakh grouping.)
- [ ] Which SMS provider and which countries should codes go to? (Assumed: Twilio, any country.)
- [ ] Is the net always Debit minus Credit, or can the invoice say which side wins? (Assumed: Debit minus Credit.)
- [ ] Can you share 2 or 3 sample invoice photos so the AI can be tested against real layouts? (Assumed: test with generated samples.)
- [x] Should results be saved? (Decided: yes. Every invoice that reaches a final amount is saved to a per-user history; see HIST-1 to HIST-7.)
- [ ] Should the picture be kept with each history entry? (Assumed: no. It is deleted after reading, as in AI-4, and the entry keeps only a reference.)

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
| 2026-11-16 | 0.9 | iOS and Android apps with Capacitor 7: native projects, camera and photo picker, status bar and splash, configurable API address, CORS for the app origins (`CORS_ORIGINS`), development-only cleartext, `npm run native:*` scripts, and run instructions. No change to the web behaviour. |
| 2026-11-16 | 0.10 | End-to-end testing, polish and hardening (no new features). Full-journey browser tests on phone, small phone and desktop with error paths, keyboard-only and enlarged-text runs. Browser Back and Forward now move between the amounts and the final amount; focus returns to the upload heading when starting again; signing out clears the amounts kept in the browser and signs out other tabs; large text no longer overlaps. API answers carry no-store and nosniff headers, unknown `/api` addresses answer JSON 404, `TRUST_PROXY` and `NODE_ENV` settings added, provider errors are logged without keys, empty upload folders are swept, start-up warns about unsafe production settings. README rewritten as a quick start. |
| 2026-11-16 | 0.11 | Any amount may be entered: the 2-decimal refusal is gone. Amounts keep up to 12 decimals and 15 whole digits (limits shown in the UI and API errors), the maths stays exact and never rounds, and the result screen shows the figure rounded to 2 decimals with a note giving the exact amount when it differs. API adds `netRounded` and `rounded`. AI: a plain number with extra decimals is kept, an ambiguous one (`12.345`) is still flagged. Ledgerly now works in Indian rupees only (₹, lakh grouping, `currency` is always INR, no other currency handling). `1e3`, `₹`, `Rs.` and `/-` are accepted when typing. |
| 2026-11-16 | 0.12 | Free local OCR reading (OCR-1 to OCR-6): Tesseract (WebAssembly, offline, language data bundled), deskew, three clean-up passes, parsing of `Debit` and `Credit` with rupee and lakh formats, totals proved against the table lines, honest confidence, timeouts and a single shared worker. New "Read with" switch (Local OCR or AI) on the upload screen, `GET /api/invoices/reading-methods`, optional `method` in the extract request, result screen names the reader used. Default reader is now `ocr` when no key is set (was `mock`; `mock` stays for the automated tests). Optional AI back-up (`OCR_FALLBACK_TO_CLAUDE`). |
| 2026-11-17 | 0.13 | Line items removed everywhere (no new features). The AI and OCR readers return only the Debit and Credit amounts (the model's JSON no longer has `line_items`, and an answer that still has them is rejected); OCR no longer reads table lines, so it can no longer prove a total by adding lines up: it now needs two agreeing readings, never reports High, and leaves a box empty when readings disagree. The calculate API takes only `{ debit, credit }` and no longer returns `lineCount` or accepts `items`. The shared maths drops `totalLines`. The review screen no longer shows a lines table. Invoices are plain numbers with no currency sign: the sample pictures were redrawn as just a Debit and a Credit in plain numbers, and OCR reads them, and degraded copies of them, exactly. |
| 2026-11-19 | 0.14 | Saved invoice history (HIST-1 to HIST-7): every invoice that reaches the final amount is saved automatically and corrections update the same record; History page with search, Net Debit / Net Credit / Balanced filter and date range, entry page with copy and delete; `/api/history` endpoints; history kept in a JSON file (`HISTORY_FILE`) behind a small store interface with an optional `agentId`, ready for agent and superadmin roles. The picture is still deleted after reading, so entries keep a reference, not the picture. |
| 2026-11-19 | 0.15 | Agent and superadmin roles (ROLE-1 to ROLE-8): sign-in is now only for superadmin numbers (`SUPERADMIN_PHONES`) and agents a superadmin adds; role on `/api/auth/me`, checked on every request; Agents page with the overall total, per-agent Debit, Credit and net, add and remove (removed agents keep their list and can be added back); one agent's list for the superadmin; agent-only invoice, calculate and history routes with the agent id set by the server; `GET /api/my-totals` and a totals card on the History page; `AGENTS_FILE` setting. The whiteboard section is now the Roles section. |
| 2026-11-23 | 0.16 | Free OCR tuned and made the default reader (OCR-1, OCR-3, OCR-7): page cut out of the desk, light evened out, ruled lines removed, up to five whole-page passes plus three digits-only close-ups of each amount, amounts found under their labels, loose handwritten label spellings. Each amount now carries a High or Low confidence flag (`amountConfidence`), shown as a green or pink badge; OCR can now say High. `VISION_PROVIDER` defaults to `ocr` even when an API key is set. Accuracy benchmark in `server/bench/` (docs/OCR-ACCURACY.md). |
