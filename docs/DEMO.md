# Ledgerly demo script (5 to 7 minutes)

A walk-through for showing Ledgerly to a manager. Everything marked **Live** is built and works on `main`. Anything marked **Roadmap** is not built; say so plainly.

## The story in one line

Agents today read an invoice by eye, work out Debit minus Credit by hand, and write down the net. Ledgerly does that from a photo: sign in, upload, the amounts are read for you (with free local OCR, or with AI), you check them, and you get the final amount as a Net Debit, Net Credit or Balanced.

## Pick how pictures are read: the "Read with" switch

On the upload screen there is a **Read with** switch with two choices. You can flip it live, between two uploads, to show the difference.

|                          | **Local OCR** (default, no setup)                                                     | **AI (Claude)**                                                    |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Needs                    | Nothing. It is built in and works offline                                             | An `ANTHROPIC_API_KEY` with billing (see the README), then restart |
| Terminal says            | `vision: ocr` (the default, with or without a key)                                    | `vision: claude` only if you set `VISION_PROVIDER=claude`          |
| What "Read amounts" does | Really reads the picture on this computer, free. About 1 to 7 seconds                 | Really reads the picture with Claude. A few seconds                |
| Cost                     | Free, and the picture never leaves the computer                                       | Roughly 2 to 6 US cents per reading (estimate)                     |
| Good at                  | Printed invoices, also blurry or tilted photos of them; flags each amount High or Low | Messy, handwritten or unusual layouts                              |
| Say to the room          | "This one is free and private. It reads printed invoices and tells you when unsure."  | "This one is the AI. Better on messy photos, costs a little."      |

Without an API key the **AI (Claude)** choice is greyed out and says why ("not set up on this server"). That is expected: you can still run the whole demo with Local OCR. If you do have a key, both choices are live and the switch remembers your last choice for this browser tab.

The sign-in code is never sent as a real text: it appears in the terminal (**Live**: Twilio sending is built but needs an account, so it is not part of the demo).

**Demo values (mock) mode** is the old placeholder mode: `VISION_PROVIDER=mock` in `server/.env`. Pictures are not read at all, the boxes show made-up numbers, and the switch is hidden. The screen says "Demo values, not read from your picture." Only use it if OCR misbehaves on the day; say so plainly and type the real figures in step 5.

**Be honest about OCR.** It does not understand the invoice; it reads the letters and numbers next to **Debit** and **Credit**, and nothing else (Ledgerly has no line items and invoices carry plain numbers, no currency sign). Each amount it fills in has a flag: a green **High confidence** when every reading of the picture (whole-page readings and digits-only close-ups) agreed, or a pink **Low confidence** when the amount won but not every reading agreed: those are the ones to double-check. It fills a box only when at least two readings agree, and otherwise leaves it empty with **Please check**. In our tests every High amount was right; Low amounts on handwriting were sometimes wrong, which is exactly why they are pink. If a reading is wrong on the day, correct the box by hand (step 5) or flip to the **AI (Claude)** choice.

## Sample invoices (in `docs/demo/`)

Made-up inputs, not screenshots. Regenerate with `node docs/demo/make-demo-invoices.mjs`.

| File                       | Printed Debit | Printed Credit | Expected final amount      | Demo values mode: type   |
| -------------------------- | ------------- | -------------- | -------------------------- | ------------------------ |
| `demo-1-net-debit.png`     | ₹1,25,050.00  | ₹40,000.00     | **Net Debit ₹85,050.00**   | `125050.00` / `40000.00` |
| `demo-2-net-credit.png`    | ₹30,000.00    | ₹1,12,575.00   | **Net Credit ₹82,575.00**  | `30000` / `112575`       |
| `demo-3-balanced.png`      | ₹64,000.00    | ₹64,000.00     | **Balanced ₹0.00**         | `64000` / `64000`        |
| `demo-4-tricky-blurry.jpg` | ₹2,48,025.00  | ₹91,500.00     | **Net Debit ₹1,56,525.00** | `248025` / `91500`       |

Ledgerly works in Indian rupees only, so every result shows the ₹ sign with lakh grouping (`₹85,050.00`), in both modes and when you use **Type the amounts instead**. The sample invoices are plain numbers (no currency sign), in rupees.

**What has and has not been checked.** Local OCR was run for real, offline, on the four pictures and on degraded copies of them (blurred, heavily compressed, half size, tilted 4 and 6 degrees, dark and low contrast, turned 90 and 180 degrees): all readings gave exactly the right Debit and Credit. Only the deliberately noisy copy of each picture was unreadable, and OCR said so instead of guessing. The AI choice (real Claude) was not run, because no API key was available: do one rehearsal with your key first.

| File                       | Local OCR reads (Debit / Credit) | Flags       |
| -------------------------- | -------------------------------- | ----------- |
| `demo-1-net-debit.png`     | 125050.00 / 40000.00             | High / High |
| `demo-2-net-credit.png`    | 30000.00 / 112575.00             | High / High |
| `demo-3-balanced.png`      | 64000.00 / 64000.00              | High / High |
| `demo-4-tricky-blurry.jpg` | 248025.00 / 91500.00             | High / Low  |

To show a pink **Low confidence** flag, read `server/test/fixtures/ocr/handwritten-ruled-photo.jpg` (a handwriting-style note on ruled paper, photographed): it reads Debit `5190.00` and Credit `296208.00`, with at least one of them flagged Low. Accuracy on 96 printed and handwriting-style test invoices is in [OCR-ACCURACY.md](OCR-ACCURACY.md).

These are made-up, computer-drawn invoices with clear printed text, so they are the friendly case. A real photo of a crumpled paper, handwriting, or a different layout may fail or come back flagged Low; that is why the screen always asks you to check. The blurry one is a deliberately rough "phone photo" (soft focus, tilted, uneven light); OCR cuts the page out of the desk and straightens it before reading.

## Before the demo (checklist)

Do this 10 minutes ahead, on the computer you will present from.

- [ ] Node is 20.12 or newer: `node -v`.
- [ ] Latest `main` is on your machine and `npm install` has been run (see the README "Run it on your computer").
- [ ] To show the AI choice too: `server/.env` has `ANTHROPIC_API_KEY=...`, you restarted, and the terminal says `vision: claude`. Internet works. (Skip this to demo Local OCR only.)
- [ ] `npm run dev` is running and the terminal says `API listening on http://localhost:4000 (...)`.
- [ ] Warm up OCR: read `demo-1-net-debit.png` once before the audience arrives. The first reading starts the OCR engine and is slower (a few seconds); later ones are quicker.
- [ ] Open http://localhost:5173 in a clean browser window. Zoom in a notch (Ctrl/Cmd and `+`) so the back row can read it.
- [ ] Put the terminal where you can show it: the sign-in code appears there. Make the font large.
- [ ] Do one full dry run with `demo-1-net-debit.png`, then **sign out** so you start the demo from the Sign in page. (Restarting `npm run dev` also signs you out.)
- [ ] The four sample pictures are somewhere easy to find in the file picker.
- [ ] Phone view ready: either your real phone on the same Wi-Fi (README "Try it on your phone"; needs the second command with `--host`) or Chrome device mode (F12, then Ctrl/Cmd+Shift+M, pick iPhone 14).
- [ ] Silence notifications. Close tabs you do not want on screen.
- [ ] Know your numbers. Only the superadmin and agents the superadmin has added can sign in. The local demo superadmin is `+91 99999 00000`. You need a second number in international format to add as an agent, for example `+91 98765 43210` (it can be any valid-looking number: codes only print in the terminal). Before the demo, sign in as the superadmin, add that agent, and sign out, so the demo can start from the Sign in page.

## The storyline

### 1. The problem (about 45 seconds). No clicking.

**Say:** "Agents get invoices as photos or PDFs. For each one they read the Debit and the Credit by eye, subtract by hand, and write down whether it is a net debit or credit. It is slow, and one slipped digit means a wrong balance. Ledgerly takes the photo and does that for them."

Show the sample picture `demo-1-net-debit.png` on screen so people see what an agent sees: the Debit amount and the Credit amount printed on it. Those are the only two figures Ledgerly reads.

### 2. Sign in with a text-message code (about 1 minute). **Live**

1. Open http://localhost:5173. **Expect:** the Ledgerly logo, "Read the invoice. See the balance." and a **Sign in** box with **Mobile number**.
2. Type the agent's number, for example `+91 98765 43210`, and press **Send code**. **Expect:** "We sent a code to +91 98765 43210" and a **6-digit code** box. The button says "Resend code in 30s".
3. Switch to the terminal. **Say:** "In production this arrives as a text. In this demo it prints here." Point at the line `[sms:console] to +919876543210: Your Ledgerly code is 106950.`
4. Type the 6 digits and press **Sign in**. **Expect:** **Welcome, Asha Rao** (the name the superadmin gave), "Signed in as +919876543210." and **Upload your invoice**, with **New invoice** and **History** in the header.

Optional 15 seconds, "who is allowed in": sign out and try a number nobody added. **Expect:** "This number is not registered with Ledgerly. Ask your administrator to add it." and no code is sent. **Say:** "Only people the administrator adds can sign in."

Optional 10 seconds if asked about security: type a wrong code ("Wrong code. 4 tries left."), or press Send code twice quickly ("Please wait 30 seconds"). Codes expire in 5 minutes and sessions last 12 hours.

### 3. Upload the invoice (about 45 seconds). **Live**

1. **Expect:** on **Upload your invoice**, a **Read with** switch: **Local OCR** (selected) and **AI (Claude)**. **Say:** "Two ways to read it: a free one that runs right here, and the AI."
2. Press **Choose file** and pick `demo-1-net-debit.png`. **Expect:** a preview, the file name and size, "Picture uploaded.", and four buttons: **Read amounts**, **Replace picture**, **Type the amounts instead**, **Remove**.
3. **Say:** "This works with JPEG, PNG, WebP and iPhone HEIC photos up to 10 MB. On a phone there is also a Take photo button."

### 4. The amounts are read (about 1.5 minutes). **Live**

1. With **Local OCR** selected, press **Read amounts**. **Expect:** a spinner and "Reading your invoice with local OCR..." then, after a few seconds, **Amounts we found**: "Read from your picture with local OCR (free, no AI)", **Read with: Local OCR**.
2. **Expect:** Debit `125050.00` and Credit `40000.00` filled in, "Amounts in rupees (₹)", a green **High confidence** flag beside each amount, and a note to check each amount against the picture. **Say:** "It reads the picture several ways. Green means every reading agreed; pink means look at this one. There are no line items: just the Debit and the Credit."
3. **Show the switch (optional, strong in a demo).** Press **Upload a different invoice**, choose `demo-4-tricky-blurry.jpg` and read it with **Local OCR**: it takes a few seconds and should give `248025.00` / `91500.00`. Then, if you have a key, upload it again, flip **Read with** to **AI (Claude)** and read: **Read with: AI (Claude)** appears on the result. **Say:** "Same picture, two readers. The result says which one was used." If you have no key, point at the greyed-out **AI (Claude)** and read out why.
4. **Demo values mode only:** the notice "Demo values, not read from your picture" and unrelated numbers such as `1484.91` and `147.63`. **Say:** "These are placeholders; an agent would check them." Go straight to step 5.

### 5. Check and correct (about 1 minute). **Live**

**Say:** "The reader never has the last word. Every amount is an editable box."

1. In **Debit** type `12.345`. **Expect:** no error: any amount is accepted, with up to 12 decimal places and 15 digits before the point (the line under the boxes says so). Then type `abc` or `£5`: a red message explains why they are refused (`£5`: "Ledgerly works in rupees"). **Say:** "People can type whatever amount they like. It only refuses what is not a number, and it never rounds behind your back."
2. Demo values mode: set Debit to `125050.00` and Credit to `40000.00` (the figures printed on the picture). Otherwise the figures are already right; to show a fix, change Credit to `45000.00`, then use **Reset to what was found** to get `40000.00` back.
3. Optional: refresh the page. **Expect:** your edits are still there. (The picture itself is already deleted from the server once read. **Say:** "We do not keep invoice pictures after reading them.")

### 6. The final amount (about 1 minute). **Live**

1. Press **Calculate final amount**. **Expect:** **Final amount**, the label **NET DEBIT**, `₹85,050.00` in large type, the working `Debit ₹1,25,050.00 − Credit ₹40,000.00 = ₹85,050.00`, and **How it was worked out**.
2. Under **Change an amount**, set Credit to `200000`. **Expect:** it flips to **NET CREDIT** immediately, no button needed. Set Credit equal to Debit (`125050`): **BALANCED**. Put Credit back to `40000`.
3. Show an amount with many decimals: set Debit to `12.345` and clear Credit. **Expect:** `₹12.35` in large type with the note "Shown rounded to 2 decimal places. The exact amount is ₹12.345." and the working showing `₹12.345`. **Say:** "The big figure is rounded to 2 decimals for reading; the working keeps every decimal, and nothing is rounded in the maths." Put the amounts back.
4. Press **Copy result** and paste into any notes app. **Expect:** one line such as `Net Debit ₹85,050.00 (Debit ₹1,25,050.00 − Credit ₹40,000.00)`. **Say:** "That is the line an agent can paste straight into their system."
5. **Say (one sentence):** "The sums are exact decimals, never floating point, so `0.30 + 0.10` is exactly `0.40`."

Optional, if time: press **Start a new invoice** (the button on the result screen; the **New invoice** link in the header only goes back to the amounts while an invoice is open) and run `demo-2-net-credit.png` (Net Credit ₹82,575.00) or `demo-4-tricky-blurry.jpg` (the rough photo).

### 7. The administrator's view (about 1.5 minutes). **Live**

1. Press **History** in the header. **Expect:** **Your total** (Debit total, Credit total, the net of all this agent's invoices) and each invoice saved so far, newest first. **Say:** "Every invoice the agent finishes is kept in their own list, and the total adds them all up exactly."
2. Press **Sign out**, then sign in as the superadmin, `+91 99999 00000` (the code is in the terminal). **Expect:** the **Agents** page with the **Overall total**, then each agent's Debit, Credit, net and number of invoices.
3. Press **View list** on the agent. **Expect:** their totals and every invoice, read only. **Say:** "The administrator sees every agent's list and total, and can add or remove agents. Only people added here can sign in."
4. Optional: type a new name and number under **Add an agent** and press **Add agent**. Press **Remove** then **Yes, remove** on that agent: the row moves to **Removed agents**, and their invoices still count in the overall total.

### 8. On a phone (about 45 seconds). **Live**

1. Open the app on the phone (or device mode). Sign in the same way; the code is still in the computer's terminal.
2. **Expect:** the same flow, laid out for one hand: big buttons, the camera option **Take photo**, and the same result screen. **Say:** "Same app on web and phone. The same app is also wrapped for iOS and Android (see the README); the code for that is on main, but it has not been put in the app stores."
3. Dark mode: switch the phone or computer to dark mode and the colours change on their own.

### 9. What is next (about 45 seconds). **Roadmap, none of this is built**

**Say:** "What you have seen is the core loop. Next:"

- **More for the administrator.** Date filters and export of each agent's list, and the meaning of the crossed-out and ticked amounts on the whiteboard (to be confirmed).
- **iOS and Android store apps.** The web app is already wrapped for iOS and Android (see the README), but it has not been published to the App Store or Google Play.
- **Real text messages.** Twilio sending is built but needs a Twilio account to switch on.

Then stop and take questions.

## If something goes wrong

| Problem                                                                  | What to do                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local OCR leaves a box empty and shows **Please check**                  | Working as designed: the readings did not agree on the number, so it was left empty. Type the figure yourself, or press **Upload a different invoice** and try again with a clearer photo. Good point about trust. |
| Local OCR says "We could not find an invoice in this picture"            | It found no Debit or Credit label. Try a straighter, brighter photo, or press **Type the amounts instead**.                                                                                                        |
| The first Local OCR reading is slow                                      | The engine starts on first use (a few seconds). Warm it up before the demo (see the checklist). If it says it took too long, press **Read amounts** again.                                                         |
| **AI (Claude)** is greyed out                                            | No API key on the server. Use Local OCR, or add the key to `server/.env`, restart `npm run dev` and sign in again.                                                                                                 |
| AI is slow or says "Reading the invoice took too long"                   | The picture is kept. Press **Read amounts** once more, or flip **Read with** to **Local OCR** and read it again (no internet needed). Last resort: **Type the amounts instead**.                                   |
| "Could not reach the AI service" or "AI reading is not set up correctly" | No internet or a bad key. Flip **Read with** to **Local OCR** and press **Read amounts** again.                                                                                                                    |
| The AI returned an empty box and **Please check**                        | Working as designed: it will not guess an unclear amount. Type the figure yourself and continue.                                                                                                                   |
| "The AI service is busy"                                                 | Wait the stated time, or flip to **Local OCR**.                                                                                                                                                                    |
| Code is not in the terminal                                              | Scroll the terminal or check you are looking at the window running `npm run dev`. Press **Resend code** after 30 seconds (the new code is a new line).                                                             |
| Back on the Sign in page unexpectedly                                    | The server restarted. Sign in again.                                                                                                                                                                               |
| Phone cannot open the page                                               | Wi-Fi mismatch or firewall. Fall back to Chrome device mode on the computer, which looks the same.                                                                                                                 |
| Everything is broken                                                     | Say "let me show you the screens", and open the sample picture `demo-1-net-debit.png` plus your screenshots if you have them. Nothing in the story needs the internet apart from the AI choice.                    |

## Reset between runs

Press **Sign out**. To start completely fresh stop the app with `Ctrl+C` and run `npm run dev` again.
