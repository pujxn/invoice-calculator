<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/public/brand/logo-dark.svg" />
    <img src="client/public/brand/logo.svg" alt="Ledgerly" height="64" />
  </picture>
</p>

# Ledgerly

Take a photo of an invoice. Ledgerly reads the **Debit** and **Credit** amounts (with free local OCR, or with AI if you add a key), lets you check and correct them, and shows the **final amount** as a Net Debit, a Net Credit or Balanced. People sign in with a one-time code sent by SMS. There are two roles: **agents** process invoices and keep their own list, and a **superadmin** adds and removes agents and sees every agent's list and totals. It is one responsive web app that works on a phone and on a computer.

- Product spec (source of truth): [SPEC.md](SPEC.md), a snapshot of the [live spec doc](https://claude.ai/artifact/JZMUDH3jG5nh1CgxcAosNs). Change the doc first, then update this file.
- Status: sign in, upload, AI reading, calculation, the result screen and a saved history of every invoice all work, in the browser and as an iOS and Android app (see [Run the mobile apps](#run-the-mobile-apps-ios-and-android)). See the requirement table in SPEC.md.
- Want to show it to someone? See the demo script, [docs/DEMO.md](docs/DEMO.md), with sample invoice pictures in [docs/demo/](docs/demo/).

## Quick start

You need [Node.js](https://nodejs.org) 20.12 or newer (the "LTS" download is fine; Node 22 is tested too). Check with `node -v`. Then, in a terminal in the project folder:

```
npm install
npm run dev
```

Open **http://localhost:5173**. To stop, press `Ctrl+C`.

Nothing else is needed. No real text message is sent (the sign-in code is printed in the terminal where `npm run dev` runs), and no paid AI is called: pictures are read by **free local OCR** that runs on your computer, with no internet and no key. The terminal says `vision: ocr`.

### Try the whole thing (about 5 minutes)

Ledgerly has two roles. Only the **superadmin** and **agents the superadmin has added** can sign in, so you start as the superadmin, add yourself as an agent, then sign in as that agent. (The sign-in code is never sent as a real text here: it is printed in the terminal where `npm run dev` runs.)

1. **Sign in as the superadmin.** On a local demo with no settings, the superadmin number is **`+91 99999 00000`** (the terminal prints it when the server starts). Type it, press **Send code**, then look in the terminal for a line like `[sms:console] to +919999900000: Your Ledgerly code is 106950.` and type the 6 digits into the page. You land on the **Agents** page.
2. **Add an agent.** Under **Add an agent** type a name and a mobile number with its country code, for example `Asha Rao` and `+91 98765 43210`, and press **Add agent**. She appears under **Current agents** with ₹0.00 and 0 invoices. (Numbers that are not added get "This number is not registered with Ledgerly.") Press **Sign out**.
3. **Sign in as the agent.** Use the number you just added; the code is in the terminal again. You see **Welcome, Asha Rao** with **New invoice** and **History** in the header.
4. **Upload.** Press **Choose file** and pick any JPEG, PNG, WebP or HEIC picture (a screenshot is fine), or one of the demo invoices in `docs/demo/`. A preview appears. On a phone there is also **Take photo**.
5. **Read.** Above the buttons is a **Read with** switch: **Local OCR** (free, the default) and **AI (Claude)** (greyed out, with the reason, until you add an API key). Press **Read amounts**. You see **Amounts we found**: a Debit box and a Credit box (both editable), which reader was used, and how confident it is. Only the Debit and Credit amounts are read: Ledgerly has no line items. To type your own, press **Type the amounts instead** after uploading.
6. **Calculate.** Press **Calculate final amount**. You see **Net Debit**, **Net Credit** or **Balanced** in large type, with the working, and a note that the invoice was saved to your history. Change either amount in the boxes below it and the result and the saved copy update at once. **Copy result** copies one line you can paste.
7. **Do a second invoice.** Press **Start a new invoice** (no new sign-in) and repeat steps 4 to 6 with different amounts.
8. **See your list.** Press **History** in the header. At the top is **Your total** (Debit total, Credit total and the net of all your invoices); below it, each invoice, newest first. Open one to correct or delete it.
9. **See it as the superadmin.** **Sign out**, sign in again as `+91 99999 00000` (get the new code from the terminal). The **Agents** page now shows the **Overall total** and Asha's Debit, Credit, net and invoice count. Press **View list** to see each of her invoices (read only). Press **Remove**, then **Yes, remove**: she moves to **Removed agents** (her invoices still count in the overall total) and can no longer sign in. Add the same number again and she is back with her list.
10. **Go back and forward.** The browser's Back button (or **Back to the invoice**) returns to the amounts without losing your edits. Refreshing the page keeps your place. **Sign out** clears everything from the browser.

Things worth trying: a wrong code (4 tries left, then the code locks), a PDF instead of a picture, a picture over 10 MB, a HEIC photo, any amount such as Debit `12.345` (accepted, shown as `₹12.35` with a note giving the exact `₹12.345`; up to 15 digits and 12 decimals), `0.001`, `1e3`, `Rs. 500/-`, `£5` or `abc` (refused with a message), both boxes empty, and Debit `0.30` with Credit `0.10` (exactly `0.20`). Everything is in Indian rupees (₹, lakh grouping like ₹12,34,567.50).

### See it on a phone

Your computer and phone must be on the same Wi-Fi. Run `npm run dev -w server` in one terminal and `npm run dev -w client -- --host` in another. The second prints a `Network:` address such as `http://192.168.1.20:5173`; open it on the phone. The sign-in code still appears in the computer's terminal. On a computer you can also press F12 then Ctrl+Shift+M (Cmd+Shift+M on a Mac) for a phone-sized window, and switch your system to dark mode to see the dark theme.

### If something goes wrong

| What you see                                                         | What it means and what to do                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.loadEnvFile is not a function` right after `npm run dev`    | Your Node is too old (18 or older). Install Node 20.12 or newer from https://nodejs.org, open a **new** terminal, check `node -v`, then run `npm install` again.                                                                                                                               |
| `npm: command not found` or `node: command not found`                | Node is not installed, or the terminal was opened before you installed it. Install Node and open a new terminal.                                                                                                                                                                               |
| `Error: listen EADDRINUSE: address already in use 0.0.0.0:4000`      | Something is already using port 4000, often an earlier `npm run dev` still running. Find the terminal that is running it and press `Ctrl+C`. Mac/Linux: `lsof -i :4000` shows the program. Windows: `netstat -ano \| findstr :4000`.                                                           |
| `Port 5173 is in use, trying another one...`                         | Another copy of the web app is running. Vite moves to 5174 and prints the new address; open that one, or stop the old copy first so you always get 5173.                                                                                                                                       |
| The page loads but sign-in says it cannot reach the server           | The API is not running (see the `EADDRINUSE` row), or you started only the web app. Run `npm run dev` from the project root so both start.                                                                                                                                                     |
| "This number is not registered with Ledgerly"                        | Only the superadmin and agents a superadmin has added can sign in. On a local demo sign in as the superadmin `+91 99999 00000`, add the number on the **Agents** page, then sign in with it. To use your own number as superadmin set `SUPERADMIN_PHONES=+91...` in `server/.env` and restart. |
| You are suddenly back on the Sign in page                            | Sessions live in server memory, so restarting `npm run dev` (it restarts itself when you save a server file) signs everyone out. Sign in again; the new code is in the terminal.                                                                                                               |
| Where is the code?                                                   | In the terminal running `npm run dev`, on a line such as `[sms:console] to +44...: Your Ledgerly code is 106950.` Scroll up if more output has appeared since.                                                                                                                                 |
| "Please wait 30 seconds" or "too many requests"                      | Normal limits on codes. Wait, or restart `npm run dev` to reset them.                                                                                                                                                                                                                          |
| `npm install` fails with a permissions error or on a company network | Do not use `sudo`. Make sure the folder is somewhere you own (not `C:\Program Files`), and ask IT about the npm registry if it is blocked.                                                                                                                                                     |
| The browser tests cannot start a browser                             | Run `npx playwright install chromium` once.                                                                                                                                                                                                                                                    |
| Pictures pile up in `server/uploads`                                 | They are deleted automatically after 24 hours, or as soon as they are read. Safe to delete by hand.                                                                                                                                                                                            |

## Read pictures for free with local OCR

Try it (the demo invoices are in `docs/demo/`):

1. `npm install`, then `npm run dev`, then open http://localhost:5173 and sign in (the code is printed in the terminal).
2. On **Upload your invoice**, check that **Read with** shows **Local OCR** selected. Press **Choose file** and pick `docs/demo/demo-1-net-debit.png`, then **Read amounts**.
3. After a few seconds you should see Debit `125050.00` and Credit `40000.00`, **Confidence: High**, and **Read with: Local OCR**. Try `demo-4-tricky-blurry.jpg` too (about 7 seconds).

How it works, in short: the picture is turned into a clean JPEG (HEIC converted, phone rotation applied), straightened if it is tilted (and turned upright if it is upside down or on its side), and read by [Tesseract](https://github.com/naptha/tesseract.js) (compiled to WebAssembly, so nothing is installed on your machine) up to three times with different clean-ups. The words are then searched for **Debit** and **Credit** with the amount beside each; nothing else on the invoice is read (no table lines). An amount is filled in only when at least two readings agree on it (Medium confidence, never High, with a note to check each amount against your picture). Otherwise the box is left empty with **Please check**. Invoices are expected to be plain numbers with no currency sign. On the four sample pictures and a set of degraded copies of them (blurred, heavily compressed, half size, tilted, dark, turned) OCR read every amount correctly; with heavy noise it says it cannot read the picture. Real photos can still be misread, so always compare with your picture.

- **Works offline.** The English language data ships in the `@tesseract.js-data/eng` npm package (about 11 MB in `node_modules`), so there is no download on first use and the tests need no network. The first reading starts the engine (a few seconds); it is stopped again after a minute idle to free memory.
- **Limits, honestly.** It reads printed text. Handwriting, very blurry or dark photos, and layouts without the words "Debit" and "Credit" will fail or come back unsure. It reads English letters and Western digits only. It needs the words Debit and Credit (or a close misspelling such as `Deb1t`).
- **Timeout.** One reading is cut off after `OCR_TIMEOUT_SECONDS` (default 45) and the page says so; the picture is kept so you can try again.
- **Privacy.** The picture never leaves the server and is deleted once read, like every other reading.
- **Optional AI back-up.** Set `ANTHROPIC_API_KEY` and `OCR_FALLBACK_TO_CLAUDE=1` and, when OCR is not sure (nothing found, low confidence), the AI reads the picture instead and the result says "Read by AI because the free OCR was not sure". Off by default.

## Use the real AI and real text messages (optional)

Settings live in `server/.env`. Create it once with `cp server/.env.example server/.env` (Windows: `copy server\.env.example server\.env`), edit it, and restart the app. Never commit it.

**Real AI** (costs a little per invoice): get a key at https://console.anthropic.com and set `ANTHROPIC_API_KEY=sk-ant-...`. The terminal then says `vision: claude` and AI becomes the default; the **Read with** switch on the upload screen lets you flip between **AI (Claude)** and **Local OCR** for each picture (it remembers your choice for the browser tab). Without a key, AI is greyed out. To keep OCR as the default even with a key, set `VISION_PROVIDER=ocr`. The key stays on the server and is never sent to the browser. The tests never use it. `VISION_PROVIDER=mock` gives made-up demo numbers without reading the picture (used by the automated tests, and a last resort for a demo); the switch is hidden then.

**Real SMS:** create a Twilio account and set `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. The server refuses to start if one is missing. A Twilio trial account can only text numbers you have verified in Twilio.

### Environment variables

With nothing set, one-time codes print to the server log and pictures are read by free local OCR.

| Variable                    | Default                                       | Purpose                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | `4000`                                        | Port for the Node API                                                                                                                                                                                                             |
| `NODE_ENV`                  | none                                          | Set to `production` on a real server: start-up then warns about console SMS, demo-value readings and a missing `AUTH_SECRET`                                                                                                      |
| `TRUST_PROXY`               | `0`                                           | Number of proxies in front of the server (usually `1` behind a load balancer) so per-IP limits see the visitor                                                                                                                    |
| `SMS_PROVIDER`              | `console`                                     | `console` prints codes to the log; `twilio` sends real SMS                                                                                                                                                                        |
| `TWILIO_ACCOUNT_SID`        | none                                          | Twilio account, needed for `twilio`                                                                                                                                                                                               |
| `TWILIO_AUTH_TOKEN`         | none                                          | Twilio secret, needed for `twilio`                                                                                                                                                                                                |
| `TWILIO_FROM_NUMBER`        | none                                          | Sending number in E.164 format                                                                                                                                                                                                    |
| `AUTH_SECRET`               | random per start                              | Key for hashing one-time codes; set a long random value so codes survive restarts                                                                                                                                                 |
| `AUTH_IP_REQUEST_LIMIT`     | `20`                                          | Code requests allowed per IP per 15 minutes                                                                                                                                                                                       |
| `AUTH_IP_VERIFY_LIMIT`      | `40`                                          | Code checks allowed per IP per 15 minutes                                                                                                                                                                                         |
| `SUPERADMIN_PHONES`         | demo number `+919999900000` (local demo only) | Mobile numbers, comma separated, that sign in as superadmin. With nothing set, the demo number is used only when `NODE_ENV` is not `production` and `SMS_PROVIDER` is `console`; in production set this, or nobody can add agents |
| `AGENTS_FILE`               | `server/data/agents.json`                     | The file the agents a superadmin adds are kept in (survives restarts, ignored by git). `memory` keeps them until the server stops                                                                                                 |
| `UPLOAD_DIR`                | `server/uploads`                              | Folder where uploaded invoice pictures are kept                                                                                                                                                                                   |
| `UPLOAD_MAX_MB`             | `10`                                          | Largest picture accepted                                                                                                                                                                                                          |
| `UPLOAD_TTL_HOURS`          | `24`                                          | Pictures are deleted after this long                                                                                                                                                                                              |
| `UPLOAD_MAX_PER_USER`       | `50`                                          | Pictures one user can keep at once                                                                                                                                                                                                |
| `HISTORY_FILE`              | `server/data/history.json`                    | Where saved invoice history is kept; `memory` keeps it only until the server stops                                                                                                                                                |
| `VISION_PROVIDER`           | `claude` if a key is set, else `ocr`          | The default reader: `ocr` (free, local), `claude` (AI) or `mock` (demo numbers). The switch can still change it                                                                                                                   |
| `OCR_TIMEOUT_SECONDS`       | `45`                                          | Give up on one local OCR reading after this long                                                                                                                                                                                  |
| `OCR_FALLBACK_TO_CLAUDE`    | off                                           | `1`: when OCR is not sure and a key is set, let the AI read the picture instead                                                                                                                                                   |
| `ANTHROPIC_API_KEY`         | none                                          | Key for Claude vision                                                                                                                                                                                                             |
| `ANTHROPIC_MODEL`           | `claude-opus-5-5`                             | Claude model used for reading invoices                                                                                                                                                                                            |
| `ANTHROPIC_EFFORT`          | `medium`                                      | How hard the model thinks: `low` to `max`, or `none`                                                                                                                                                                              |
| `ANTHROPIC_TIMEOUT_SECONDS` | `60`                                          | Give up on one AI call after this long                                                                                                                                                                                            |
| `ANTHROPIC_FALLBACKS`       | none                                          | Set to `default` to let the API retry a declined request on another model                                                                                                                                                         |
| `EXTRACT_PER_USER_PER_HOUR` | `30`                                          | Readings one user can start per hour (each costs money)                                                                                                                                                                           |
| `CORS_ORIGINS`              | none                                          | Extra websites allowed to call the API from a browser (the mobile apps always are)                                                                                                                                                |

All settings are read in one place, `server/src/config.js`.

## Run the mobile apps (iOS and Android)

The apps are the web app inside a native shell, so they look and work the same. What the shell adds: the phone's own camera and photo picker for invoice pictures, a status bar that matches the light or dark theme, the Ledgerly splash screen and app icon, and the keyboard pushing the page up instead of hiding the field.

The app does not run its own server. It talks to the same API as the web app, so **keep `npm run dev` running** while you try it. `npm run native:*` builds the app pointing at your computer's Wi-Fi address (it prints the address it picked), so an emulator and a real phone on the same Wi-Fi can both reach it.

### Android (Windows, Mac or Linux)

Install once:

1. [Android Studio](https://developer.android.com/studio) (it brings the Java it needs). On the first start accept the defaults so it installs the Android SDK.
2. An emulator: in Android Studio open **More Actions > Virtual Device Manager > Create Device**, pick a Pixel phone and a recent Android version, and finish. Or use a real phone: turn on **Developer options > USB debugging** and plug it in.

Then, each time:

1. In one terminal, from the project folder: `npm install` (first time only), then `npm run dev`. Leave it running.
2. In a second terminal: `npm run native:android`. This builds the web app, copies it into the Android project and opens Android Studio.
3. The first time, wait for the progress bar at the bottom of Android Studio ("Gradle sync") to finish. This can take several minutes.
4. Pick the emulator or your phone in the device list at the top and press the green **Run** triangle.
5. In the app, sign in as the superadmin (`+91 99999 00000`), add an agent with the number you will use, sign out and sign in as that agent. The 6-digit code appears in the terminal where `npm run dev` is running. Then tap **Take photo** (the emulator offers a fake camera scene) or **Choose from photos**.

Without opening Android Studio: start an emulator (or plug in a phone), then run `npm run native:run:android` and choose the device it lists. This needs `ANDROID_HOME` to point at the SDK, which Android Studio shows under **Settings > Languages & Frameworks > Android SDK**.

### iOS (Mac only)

Install once:

1. Xcode 16 or newer from the Mac App Store. Open it once, accept the licence and let it install the extra components. In **Xcode > Settings > Platforms** make sure an iOS simulator is installed.
2. Nothing else: the iOS project uses Swift Package Manager, so there is no CocoaPods to install.

Then, each time:

1. In one terminal: `npm install` (first time only), then `npm run dev`. Leave it running.
2. In a second terminal: `npm run native:ios`. This builds the web app, copies it into the iOS project and opens Xcode.
3. The first time, wait while Xcode downloads the Capacitor package (progress is at the top of the window).
4. Choose an iPhone in the device list at the top (for example **iPhone 16**) and press the **Run** triangle. The simulator opens with Ledgerly in it.
5. Sign in as above, reading the code from the `npm run dev` terminal. The simulator has no camera, so use **Choose from photos** (drag a picture onto the simulator window first to add it to Photos).

To run on a real iPhone: connect it, turn on **Settings > Privacy & Security > Developer Mode** on the phone, and in Xcode select the **App** target, then **Signing & Capabilities**, and choose your Apple ID under **Team**. iOS asks permission to find devices on your network the first time: tap Allow.

`npm run native:run:ios` does the same from the terminal and lets you pick a simulator or device.

### After you change the code

The app contains a built copy of the web app, not the live dev server. After changing anything under `client/`, run `npm run native:sync` (or the `npm run native:android` / `native:ios` command again) and press Run again.

### If the app says it cannot reach the server

- Is `npm run dev` still running? Open `http://<the address printed by native:sync>/api/health`, for example `http://192.168.1.20:4000/api/health`, in your phone's browser. It should show `{"ok":true,...}`.
- Phone and computer must be on the same Wi-Fi, and the computer's firewall must allow Node.js (Mac and Windows ask the first time: choose Allow).
- The wrong address was picked (VPN or several networks)? Give it yourself: `npm run native:android -- --api http://192.168.1.20:4000`. Android emulators can also use `http://10.0.2.2:4000`.

### Settings

| Where                                   | What                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/capacitor.config.ts`            | App name (Ledgerly), app id (`com.ledgerly.app`), splash, keyboard. Change the app id before publishing, then edit it in `client/android/app/build.gradle` and the Xcode project too |
| `--api <address>` or `LEDGERLY_API_URL` | The server the app talks to (baked in when you run `native:*`)                                                                                                                       |
| `CORS_ORIGINS` in `server/.env`         | Extra websites allowed to call the API from a browser. The apps are always allowed                                                                                                   |
| `npm run native:assets`                 | Rebuild every app icon and splash screen from `client/assets` (after `npm run brand`)                                                                                                |

### How the apps work

- **Server address.** In a browser, API calls go to `/api/...` on the same host. In the app the address is built in from `VITE_API_BASE_URL` (`client/src/platform/apiBase.js`). A development build uses `http://<your Wi-Fi address>:4000`.
- **Sign-in and CORS.** The session is a token sent in the `Authorization` header (no cookies), which suits an app. Because the app's page comes from the phone (`capacitor://localhost` on iOS, `https://localhost` on Android), the server answers browser permission checks for exactly those origins plus anything in `CORS_ORIGINS` (`server/src/cors.js`). Any other origin is refused.
- **Plain http is for development only.** Plain `http` to your computer is allowed only in development builds: Android debug builds (`android/app/src/debug`) and the dev setting in `capacitor.config.ts`; iOS allows `http` to addresses on your own network but never to the internet. A production build refuses an `http` address.
- **Camera.** **Take photo** and **Choose from photos** use the phone's own camera and photo library (`@capacitor/camera`), then the same upload as the web. Photos are saved as JPEG (phones that shoot HEIC convert it). In a browser the usual file inputs are used instead.
- **Session storage.** The sign-in token is kept in the app's local storage like on the web (12-hour session). It is not copied into Android backups.

### Publishing later

Build with your live server's `https` address, then use Android Studio (**Build > Generate Signed App Bundle**) or Xcode (**Product > Archive**):

```
npm run native:sync:production -- --api https://your-server.example.com
```

This needs a hosted server with HTTPS and a real SMS provider (see the roadmap in SPEC.md), an Apple Developer account and a Google Play account, and your own app id.

### What is not verified yet

These were built without a phone or emulator, so please report anything odd: running the apps on Android and iOS, the native camera and photo picker, the status bar colours and splash screen, how the keyboard pushes the page up, and automatic filling of the SMS code. The tests below cover everything that can run without a device.

- **SMS code autofill.** The code box is marked `autocomplete="one-time-code"`, which makes iOS offer the code from the text message above the keyboard. Android has no equivalent for web pages, so for now the code is typed or pasted there. A native Android plugin can be added later.
- **Tests.** `npm test` checks the server address handling, the camera wrapper, the status bar setup and the upload screen in app mode (`client/test`), the server's CORS answers (`server/test/cors.test.js`), the helper scripts and the committed native projects: app id, permissions, https-only release builds, icons, git ignores (`scripts/test`). `npm run test:ui` also makes real browser calls from another origin to prove CORS works (`e2e/native-api.spec.js`).

## For developers

```
client/   React 18 + Vite web app (dev server :5173, proxies /api to :4000)
          client/android and client/ios are the Capacitor mobile app projects
server/   Node + Express API (:4000)
shared/   Exact-decimal money maths used by both (@ledgerly/money)
e2e/      Playwright browser tests (phone, small phone, desktop)
docs/     Demo script (DEMO.md), sample invoices, logo preview
SPEC.md   Product spec, source of truth
```

| Command                   | What it does                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Start API and web app together with reload                                                                                                                  |
| `npm run build`           | Production build of the web app (`client/dist`)                                                                                                             |
| `npm start`               | Start the API only (it does not serve `client/dist`; hosting the built app is not set up yet)                                                               |
| `npm test`                | Shared, server and web app tests (fast)                                                                                                                     |
| `npm run test:ui`         | Browser tests in a hidden browser: phone, small phone and desktop windows                                                                                   |
| `npm run test:ui:screens` | Same, and saves screenshots to `test-screenshots/` (or `SCREENSHOT_DIR`); git-ignored, not in PRs                                                           |
| `npm run lint`            | ESLint (`npm run format` fixes formatting with Prettier, `format:check` verifies)                                                                           |
| `npm run brand`           | Rebuild logos, icons and splash images from the palette                                                                                                     |
| `npm run native:sync`     | Build the web app and copy it into the iOS and Android projects (more `native:*` commands: see [Run the mobile apps](#run-the-mobile-apps-ios-and-android)) |

CI runs lint, format check, tests, build and the browser tests on every pull request. The first time you run the browser tests, install the browser with `npx playwright install chromium`.

### How the tests are organised

- `server/test/` (Node's test runner): auth, sessions, rate limits, upload store and API, the history store (file persistence, search, date filters) and API, extraction pipeline with a fake AI, the OCR parser and engine (real OCR on the sample invoices, offline), the reading-method switch API, calculation API, config and hardening (headers, proxy, safe logging).
- `client/test/` (Vitest and Testing Library): every screen and flow, including Back button, focus, sign-out and colour contrast of every token.
- `shared/test/`: the money maths. `scripts/test/` checks the helper scripts and the committed native projects.
- `e2e/` (Playwright, with axe accessibility checks in light and dark): `journey.spec.js` is the full journey and the error paths (wrong codes, AI failing, connection lost, session ended, two tabs, two users, keyboard only, enlarged text); the other specs cover each feature in depth. Tests start their own API (port 4100) and web server (port 5273), so they work while `npm run dev` is running, and the AI is always the mock; `ocr.spec.js` runs against a second API (port 4101, web 5274) that really reads pictures with local OCR and has no AI key. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes. Sample pictures are in `e2e/fixtures/`.

### Web and mobile

Ledgerly is one responsive React app, designed for phone widths first. In a browser it is a normal web page (it also has a web manifest and icons, so it can be added to a home screen). The same code is wrapped with [Capacitor](https://capacitorjs.com) as an iOS and Android app, described under [Run the mobile apps](#run-the-mobile-apps-ios-and-android). Nothing changes for the web: native features switch on only inside the apps.

### Look and feel

Pink, green and white with a matching dark theme that follows the device. Colours and type are tokens at the top of `client/src/styles.css`; every pair is checked for WCAG AA contrast by tests. To change the colours, edit the tokens and the palette at the top of `scripts/build-brand.mjs`, then run `npm run brand` to rebuild the logos, icons and splash images. Logo files are in `client/public/brand/`; a preview sheet is in [docs/brand/logo-preview.png](docs/brand/logo-preview.png).

## How it works

All API routes except sign-in need `Authorization: Bearer <token>`. The full list with request and answer shapes is in [SPEC.md](SPEC.md#api-endpoints).

**Sign in.** `POST /api/auth/request-otp` `{ phone }` sends a 6-digit code (valid 5 minutes, one per 30 seconds per number, 5 per hour). `POST /api/auth/verify-otp` `{ phone, code }` returns `{ token, expiresAt }` for a 12-hour session; five wrong tries lock the code. To protect a new API route, add the `requireAuth` middleware (`app.locals.requireAuth` in `server/src/app.js`); to protect a new page, nest its route inside `<RequireAuth>` in `client/src/App.jsx`. Sessions and codes live in server memory, so restarting signs everyone out.

**Roles.** `GET /api/auth/me` returns `{ phone, name, role }`, where `role` is `superadmin` (numbers in `SUPERADMIN_PHONES`) or `agent` (numbers added on the Agents page). Any other number is refused at `request-otp` with 403. `createRequireAuth` (in `server/src/auth/routes.js`) looks the role up on every request, and `createRequireRole` builds the guards used in `server/src/app.js`: the invoice, calculate and history routes are agent-only, the `/api/agents` routes are superadmin-only. Agents live in `server/src/agents/` (a small JSON-file store, plus the exact totals in `totals.js`); an agent's invoices are the history records they own (`agentId` is set by the server, never taken from the request). On the web side `client/src/roles/` holds the superadmin pages and `RequireRole`, and `SignedInHeader` shows each role its own links. To add a page for one role, nest its route inside `<RequireRole role="agent">` or `<RequireRole role="superadmin">` in `client/src/App.jsx`.

**Pictures.** `POST /api/invoices` (multipart, field `image`) stores one JPEG, PNG, WebP or HEIC picture, decided by its bytes and not its name. Files live under `<UPLOAD_DIR>/<hash of owner>/<random id>.<ext>` with no client-chosen names, are only reachable by their owner (anyone else gets 404), and are deleted when removed, once read, or after `UPLOAD_TTL_HOURS`.

**History.** Every invoice that reaches the final amount is saved with `POST /api/history` `{ debit, credit, imageRef, method }`; the server works out the net and type itself. `GET /api/history` lists the signed-in user's invoices newest first and takes `q` (amount or the words debit, credit, balanced), `type`, `from`, `to` (a day such as `2026-11-19`) and `limit` and `offset`; `GET`, `PATCH` and `DELETE /api/history/:id` open, correct and delete one. Another user's id answers 404. The picture is deleted as soon as it is read, so an entry keeps only a reference to it. All of it goes through `server/src/history/store.js` (save, get, list, filter, update, remove), which keeps records in one JSON file (`HISTORY_FILE`); records carry an optional `agentId` so agent and superadmin screens can use the same store later.

**Reading.** `POST /api/invoices/:id/extract` turns the picture into a JPEG of at most 2000 px (HEIC converted, rotation applied, location data removed), asks the reader (`ocr`, `claude` or `mock`; the request may say which with `{ "method": "ocr" }`, see `GET /api/invoices/reading-methods`), checks the answer against a strict schema and returns `{ debit, credit, currency, confidence, notes, warnings, ... }` (just the two amounts: no line items). Amounts are decimal strings (`"1250.50"`, `"12.345"`) or `null`, added exactly, never as floating point, and every decimal on the invoice is kept; an amount that could be read two ways (`12.345`, `1,234`), is negative or is beyond the limits becomes `null` with a warning instead of a guess. `currency` is always `INR`: Ledgerly works in rupees only, and the AI is told so. The picture is deleted once read; a failed reading keeps it for a retry. Provider failures go to the server log only, with keys removed.

**Calculating.** The maths lives in `shared/` (`@ledgerly/money`), used by both the server and the web app so the screen and the API always agree. Amounts are decimal strings held exactly in `BigInt` (units of a trillionth of a rupee), in Indian rupees only (₹, lakh grouping). Any amount may be typed or sent: any number of decimals up to 12, up to 15 digits before the point, commas, `1e3`, and a pasted `₹`, `Rs.` or `/-`; negatives, other currency signs and junk get a clear message. Nothing is rounded in the maths; the result screen shows the figure rounded to 2 decimals with a note giving the exact amount when it differs. `POST /api/invoices/calculate` takes `{ "debit": "1250.50", "credit": "400.00" }` and answers `{ debit, credit, net, netRounded, rounded, signedNet, type }` (`net` is exact, e.g. `"10.001"`; `netRounded` is the same rounded to 2 decimals, `"10.00"`). Numbers instead of text are refused.

**Hardening in place.** Codes are stored as keyed hashes, compared in constant time, single use and rate limited per number and per IP. Every API answer is `no-store` with `nosniff`, no framing and no referrer. Uploads are limited by size, type and count per user. Errors are logged as one line with configured keys and anything key-shaped hidden. Behind a proxy set `TRUST_PROXY`. More in the Security section of [SPEC.md](SPEC.md#security-and-privacy).
