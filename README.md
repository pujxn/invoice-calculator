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

SMS one-time-code login, invoice picture upload and AI reading of the Debit and Credit amounts work end to end. After a picture is uploaded, **Read amounts** shows the detected Debit and Credit (editable), the lines found and anything to double check. **Calculate final amount** then shows the net as a Net Debit, Net Credit or Balanced, with the working, and updates as you correct the amounts. Requirement status is tracked in SPEC.md. The same web app is wrapped with Capacitor as an **iOS and Android app** (native camera and photo picker, status bar, splash screen): see [Run the mobile apps](#run-the-mobile-apps-ios-and-android).

## Layout

```
client/   React 18 + Vite web app (dev server on :5173, proxies /api to :4000)
          client/android and client/ios are the Capacitor mobile app projects
server/   Node + Express API (:4000)
shared/   Exact-decimal money maths used by both (the calculation lives here)
SPEC.md   Product spec, source of truth
```

## Run it on your computer

Want to show it to someone? See the demo script, [docs/DEMO.md](docs/DEMO.md), with sample invoice pictures in [docs/demo/](docs/demo/).

You need [Node.js](https://nodejs.org) version 20.12 or newer (the "LTS" download is fine). Check with `node -v`; it should print `v20.12` or higher. Node 22 is tested too.

1. Open a terminal in the project folder (the folder that contains `package.json`).
2. Install everything (once, about a minute): `npm install`. Some "vulnerabilities" or "deprecated" warnings are normal; ignore them.
3. Start the app: `npm run dev`. Wait for the line `API listening on http://localhost:4000 (sms: console, vision: mock)`.
4. Open http://localhost:5173 in your browser.

No accounts or keys are needed. This is "mock mode": no real text message is sent and no AI is used. Instead the sign-in code is printed in the terminal where `npm run dev` is running, and the amounts the "AI" finds are made-up demo values. To stop the app, press `Ctrl+C` in that terminal.

Optional: `cp server/.env.example server/.env` lets you change settings later (see the table below). You can skip it.

### If something goes wrong

| What you see                                                         | What it means and what to do                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `process.loadEnvFile is not a function` right after `npm run dev`    | Your Node is too old (18 or older). Install Node 20.12 or newer from https://nodejs.org, open a **new** terminal, check `node -v`, then run `npm install` again.                                                                     |
| `npm: command not found` or `node: command not found`                | Node is not installed, or the terminal was opened before you installed it. Install Node and open a new terminal.                                                                                                                     |
| `Error: listen EADDRINUSE: address already in use 0.0.0.0:4000`      | Something is already using port 4000, often an earlier `npm run dev` still running. Find the terminal that is running it and press `Ctrl+C`. Mac/Linux: `lsof -i :4000` shows the program. Windows: `netstat -ano \| findstr :4000`. |
| `Port 5173 is in use, trying another one...`                         | Another copy of the web app is running. Vite moves to 5174 and prints the new address; open that one, or stop the old copy first so you always get 5173.                                                                             |
| The page loads but sign-in says it cannot reach the server           | The API is not running (see the `EADDRINUSE` row), or you started only the web app. Run `npm run dev` from the project root so both start.                                                                                           |
| You are suddenly back on the Sign in page                            | Sessions live in server memory, so restarting `npm run dev` (it restarts itself when you save a server file) signs everyone out. Sign in again; the new code is in the terminal.                                                     |
| Where is the code?                                                   | In the terminal running `npm run dev`, on a line such as `[sms:console] to +44...: Your Ledgerly code is 106950.` Scroll up if more output has appeared since.                                                                       |
| "Please wait 30 seconds" or "too many requests"                      | Normal limits on codes. Wait, or restart `npm run dev` to reset them.                                                                                                                                                                |
| `npm install` fails with a permissions error or on a company network | Do not use `sudo`. Make sure the folder is somewhere you own (not `C:\Program Files`), and ask IT about the npm registry if it is blocked.                                                                                           |

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
2. Change the Debit box to `12.345`: it is accepted as it is (any amount is welcome, up to 15 digits before the decimal point and 12 decimal places, in rupees). Try `-5`, `abc` and `£5` too: a red message explains each. Then type `1300.5`, and press **Reset to what was found** to get the original numbers back.
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

**What it costs (rough estimate, not measured).** The default model, `claude-opus-5-5`, is priced at about $4 per million input tokens and $20 per million output tokens. One picture is a few thousand tokens in and one to a few thousand out, so expect roughly 2 to 6 US cents per reading, and a ten-minute demo or testing session well under a dollar. Check real usage in the Anthropic console. `EXTRACT_PER_USER_PER_HOUR` (default 30) caps readings per person per hour, and mock mode is free. A key needs billing set up in the console; the real AI path has not yet been checked against the live API by the project, so do one reading before you rely on it.

Things worth trying:

- Upload an iPhone photo (HEIC): it is converted to a normal picture before the AI sees it.
- Press **Cancel** while it reads: nothing is lost and you can press **Read amounts** again.
- Upload a photo that is not an invoice (a selfie, a blank wall): you get a message and the picture stays so you can retry or type the amounts.
- If an amount is genuinely unclear (for example `12.345`, which the AI may have read from `12,345`) the box is left empty and a "Please check" note explains why. The app never guesses an amount. A plain number with many decimals (`1234.567`, `0.001`) is kept exactly.

### Try the final amount (about 3 minutes)

Sign in, upload a picture and press **Read amounts** (steps above). This works in mock mode, with no AI key.

1. On **Amounts we found**, press **Calculate final amount**. The **Final amount** screen shows a label (**Net Debit**, **Net Credit** or **Balanced**), the amount in large type, and the working, for example `Debit ₹1,250.50 − Credit ₹400.00 = ₹850.50`. A table below shows how it was worked out.
2. Under **Change an amount**, change the Credit box to a bigger number than the Debit. The result flips to **Net Credit** straight away, with no button to press. Make them equal for **Balanced**.
3. Press **Copy result**, then paste somewhere (a notes app, a message). You get one line such as `Net Debit ₹850.50 (Debit ₹1,250.50 − Credit ₹400.00)`.
4. Refresh the page: you stay on the result with your edits. Press **Back to the invoice** to see the amounts screen again, or **Start a new invoice** to go back to upload (you stay signed in).

Things worth trying:

- Clear one box: a blank counts as none, so a Debit alone gives a Net Debit of that amount. Clear both: it says "Enter at least one amount".
- Type `0` in both boxes: **Balanced** `0.00` (zero is a real amount).
- Type `0.30` and `0.10`: exactly `0.20` (computers that use ordinary decimals get `0.19999999999999998`).
- Type `10,00,000.07` and `0.01`, or `999999999999999.99`: large amounts keep every digit and are grouped the Indian way (lakh, crore).
- Type any amount you like, for example Debit `12.345`: the big figure is shown to 2 decimals (`₹12.35`) with a note under it, "Shown rounded to 2 decimal places. The exact amount is ₹12.345." The working line and the table show every decimal. Also try `0.001`, `2.675`, `1e3` (that is 1000) and `Rs. 500/-`.
- Try `-5`, `abc`, `£5` or a 16-digit number: the result is replaced by a clear message instead of a wrong number.
- Press **Type the amounts instead** on the upload screen to try your own numbers with no picture at all.

The same maths is available on the server: while signed in, `POST /api/invoices/calculate` with `{"debit":"1250.50","credit":"400.00"}` (or `{"items":["1000.50","250.00","-400.00"]}` for a list of lines, where a minus sign means a Credit) answers with the exact result.

### Try it on your phone

Your computer and phone must be on the same Wi-Fi (not a guest network that isolates devices).

1. In one terminal run the API: `npm run dev -w server`
2. In a second terminal run the web app so other devices can reach it: `npm run dev -w client -- --host`
3. The second terminal prints a `Network:` address such as `http://192.168.1.20:5173`. Type exactly that address into your phone's browser.
4. Sign in as usual. The code still appears in the computer's terminal (the first one). On a phone, **Take photo** opens the camera.

If the phone cannot open the page: check both devices are on the same Wi-Fi, allow Node when your computer's firewall asks, and use the address from the `Network:` line (not `localhost`). Press `Ctrl+C` in both terminals to stop.

Or, without a phone: in Chrome press F12, then Ctrl+Shift+M (Cmd+Shift+M on Mac), and pick a phone such as iPhone 14.

### Run the tests

| Command                           | What it checks                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | Shared money maths, server and web app unit and component tests (fast)                                               |
| `npx playwright install chromium` | One-time download of the test browser                                                                                |
| `npm run test:ui`                 | Opens real browser windows in the background and clicks through login on a phone, a small phone and a desktop window |
| `npm run test:ui:screens`         | Same, and saves screenshots to `test-screenshots/` (not committed)                                                   |

Branding checks live in `e2e/branding.spec.js` (logo variant per colour scheme, titles, icons and manifest, accessibility with axe, contrast, focus ring, header fits 320 px) and in `client/test/` (logo and header components, brand SVGs and icons, colour contrast of every token pair).

### Web and mobile

Ledgerly is one responsive React app, designed for phone widths first. In a browser it is a normal web page (it also has a web manifest and icons, so it can be added to a home screen). The same code is wrapped with [Capacitor](https://capacitorjs.com) as an iOS and Android app, described under [Run the mobile apps](#run-the-mobile-apps-ios-and-android). Nothing changes for the web: native features switch on only inside the apps.

### Send real text messages (optional)

Create a free Twilio account, then put `SMS_PROVIDER=twilio` and your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` in `server/.env` and restart. The server refuses to start if one is missing. With a Twilio trial account you can only text numbers you have verified in Twilio.

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
5. In the app, sign in with any number such as `+44 7700 900123`. The 6-digit code appears in the terminal where `npm run dev` is running. Then tap **Take photo** (the emulator offers a fake camera scene) or **Choose from photos**.

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

### How it works

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

## Scripts

| Command                                               | What it does                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                                         | Start API and web app together with reload                               |
| `npm run build`                                       | Production build of the web app (`client/dist`)                          |
| `npm start`                                           | Start the API only                                                       |
| `npm test`                                            | Run shared, server, web app and script tests                             |
| `npm run test:ui`                                     | Run browser UI tests (Playwright, see below)                             |
| `npm run test:ui:screens`                             | Same, and refresh the screenshots in `test-screenshots/` (not committed) |
| `npm run brand`                                       | Rebuild logos, icons and splash images from the palette                  |
| `npm run native:sync`                                 | Build the web app and copy it into the iOS and Android projects          |
| `npm run native:android`                              | Sync, then open Android Studio                                           |
| `npm run native:ios`                                  | Sync, then open Xcode (Mac only)                                         |
| `npm run native:run:android` / `native:run:ios`       | Sync, then run on an emulator or phone from the terminal                 |
| `npm run native:sync:production -- --api https://...` | Store build pointing at your live server (https only)                    |
| `npm run native:assets`                               | Rebuild app icons and splash screens for both projects                   |
| `npm run lint`                                        | ESLint across the repo                                                   |
| `npm run format`                                      | Format with Prettier (`format:check` to verify)                          |

CI runs lint, format check, shared, server and client tests, build and UI tests on every pull request.

## UI tests

Every feature ships with Playwright UI tests in `e2e/`. They start their own API (port 4100, console SMS) and web dev server (port 5273), so they work while `npm run dev` is running. The first time, install the browser with `npx playwright install chromium`. The API log is written to `e2e/.server.log`, which is how tests read the one-time codes.

`npm run test:ui:screens` also saves screenshots of each screen (phone, small phone, desktop) to `test-screenshots/`, or to `SCREENSHOT_DIR` if set. They are git-ignored; they are sent to the reviewer with the pull request, not committed. Sample invoice pictures for the tests are in `e2e/fixtures/` (`node e2e/fixtures/make-fixtures.mjs` recreates them).

## Environment variables

Set these in `server/.env` (see `server/.env.example`). With nothing set, one-time codes print to the server log and AI is off.

| Variable                    | Default                               | Purpose                                                                     |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `PORT`                      | `4000`                                | Port for the Node API                                                       |
| `SMS_PROVIDER`              | `console`                             | `console` prints codes to the log; `twilio` sends real SMS                  |
| `TWILIO_ACCOUNT_SID`        | none                                  | Twilio account, needed for `twilio`                                         |
| `TWILIO_AUTH_TOKEN`         | none                                  | Twilio secret, needed for `twilio`                                          |
| `TWILIO_FROM_NUMBER`        | none                                  | Sending number in E.164 format                                              |
| `AUTH_SECRET`               | random per start                      | Key for hashing one-time codes; set to survive restarts                     |
| `AUTH_IP_REQUEST_LIMIT`     | `20`                                  | Code requests allowed per IP per 15 minutes                                 |
| `AUTH_IP_VERIFY_LIMIT`      | `40`                                  | Code checks allowed per IP per 15 minutes                                   |
| `UPLOAD_DIR`                | `server/uploads`                      | Folder where uploaded invoice pictures are kept                             |
| `UPLOAD_MAX_MB`             | `10`                                  | Largest picture accepted                                                    |
| `UPLOAD_TTL_HOURS`          | `24`                                  | Pictures are deleted after this long                                        |
| `UPLOAD_MAX_PER_USER`       | `50`                                  | Pictures one user can keep at once                                          |
| `VISION_PROVIDER`           | `claude` if a key is set, else `mock` | Which AI reads the image; `mock` skips AI                                   |
| `ANTHROPIC_API_KEY`         | none                                  | Key for Claude vision                                                       |
| `ANTHROPIC_MODEL`           | `claude-opus-5-5`                     | Claude model used for extraction                                            |
| `ANTHROPIC_EFFORT`          | `medium`                              | How hard the model thinks: `low` to `max`, or `none`                        |
| `ANTHROPIC_TIMEOUT_SECONDS` | `60`                                  | Give up on one AI call after this long                                      |
| `ANTHROPIC_FALLBACKS`       | none                                  | Set to `default` to let the API retry a declined request on another model   |
| `EXTRACT_PER_USER_PER_HOUR` | `30`                                  | Readings one user can start per hour (each costs money)                     |
| `CORS_ORIGINS`              | none                                  | Extra websites allowed to call the API from a browser (the apps always are) |

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
  "currency": "INR",
  "confidence": "high",
  "notes": "…",
  "warnings": [{ "field": "debit", "code": "ambiguous", "message": "…" }],
  "lineItems": [{ "description": "Parts", "column": "debit", "amount": "1000.50" }],
  "itemTotals": { "debit": "1250.50", "credit": "400.00" }
}
```

- **Amounts are decimal strings** (`"1250.50"`, `"12.345"`) or `null` when not on the invoice, and are added exactly, never as floating point. Every decimal the invoice shows is kept. An amount that could be read two ways (`12.345`, `1,234`), is negative, or is beyond the limits (15 digits before the point, 12 decimals) becomes `null` with a warning instead of a guess. `currency` is always `"INR"`: Ledgerly works in rupees only, and the AI is told so.
- **The picture is deleted** once it has been read (`imageDeleted`). If reading fails, it is kept so the user can retry.
- **Errors** (JSON `{ error, code }`): 404 unknown picture, 409 already being read, 422 `unreadable_image` / `unreadable_invoice` / `image_rejected` / `declined`, 429 `rate_limited` (also when a user exceeds `EXTRACT_PER_USER_PER_HOUR`; has `retryAfterSeconds` and `Retry-After`), 502 `provider_unavailable` / `provider_not_configured` / `bad_model_output`, 504 `timeout`. Details of provider failures go to the server log only.
- **How it works** (`server/src/extraction/`): `prepareImage.js` turns the picture into a JPEG of at most 2000 px (converts HEIC, applies phone rotation, drops location data); a provider (`providers/claude.js` or `providers/mock.js`) returns JSON; `schema.js` rejects anything that is not exactly the agreed shape; `normalize.js` and `money.js` turn it into exact decimals and warnings. Pick the provider with `VISION_PROVIDER` (`claude` or `mock`). Tests inject a fake provider, so no test calls the real API.
- On the web page, `<InvoiceFlow />` (`client/src/invoices/`) shows the upload screen and then the editable results; the reading is kept in this browser tab's session storage so a reload keeps edits.

## The calculation

The maths lives in `shared/` (package `@ledgerly/money`), a small dependency-free module that the server and the web app both import, so the screen and the API always give the same answer.

- **Exact money, in rupees.** Amounts are decimal strings (`"1250.50"`, `"12.345"`) and are held as whole counts of a trillionth of a rupee in `BigInt`. Nothing is ever turned into a floating point number, and nothing is rounded in the maths.
- **Signed line items.** `totalLines(items)` takes a list where a positive amount is a Debit line and a negative amount is a Credit line, and returns the Debit total, the Credit total, the net (never negative), the signed net and the type (`debit`, `credit` or `balanced`). `calculateNet({ debit, credit })` is the usual invoice as a list of two. A blank or missing side counts as 0, but at least one must be given.
- **Rules.** Any amount may be typed or sent: any number of decimals up to 12 (`12.345`, `0.001`), up to 15 digits before the decimal point, commas as thousands (`1,250.50`, or `12,50,000` in lakh style), `1e3` style, and a pasted `₹`, `Rs.` or `/-`. Not accepted, with a clear message: negatives, other currency signs, non-numbers, more than 12 decimals or 15 whole digits, and input over 100 characters. A list may hold up to 5,000 lines, and a total may go beyond the single-amount limit.
- **Showing it.** `formatAmount("1250.5")` is `₹1,250.50` (lakh grouping: `₹12,34,567.50`). The figure is rounded to 2 decimals for showing only (half away from zero): `formatAmount("12.345")` is `₹12.35` and `formatAmount("12.345", { exact: true })` is `₹12.345`. `describeResult` builds the label, the working (always exact), a note when the shown figure is rounded, and the line that Copy result copies.
- **API.** `POST /api/invoices/calculate` (signed in) takes `{ "debit": "1250.50", "credit": "400.00" }` or `{ "items": ["1000.50", "-400.00"] }` and answers `{ debit, credit, net, netRounded, rounded, signedNet, type, lineCount }`: `net` is exact (`"10.001"`), `netRounded` is the same rounded to 2 decimals (`"10.00"`) and `rounded` says whether they differ. Amounts must be text: a JSON number is refused because it has already been through floating point.
- **Tests.** `shared/test/` (maths, formatting), `server/test/calculate.test.js` (API), `client/test/Result.test.jsx` (screen) and `e2e/calculate.spec.js` (whole flow in a browser).
- On the web page, `<ResultScreen />` (`client/src/invoices/`) is step 5; `<InvoiceFlow />` moves between upload, review and result.

## Build order

1. Repo setup and scaffold
2. SMS one-time-code login
3. Invoice upload
4. AI amount extraction
5. Review and calculation of the net amount
6. iOS and Android apps with Capacitor (this step)
