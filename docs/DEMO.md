# Ledgerly demo script (5 to 7 minutes)

A walk-through for showing Ledgerly to a manager. Everything marked **Live** is built and works on `main`. Anything marked **Roadmap** is not built; say so plainly.

## The story in one line

Agents today read an invoice by eye, work out Debit minus Credit by hand, and write down the net. Ledgerly does that from a photo: sign in, upload, AI reads the amounts, you check them, and you get the final amount as a Net Debit, Net Credit or Balanced.

## Pick your mode before you start

|                          | Mode A: real AI                                      | Mode B: mock (default, no setup)                                                  |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Needs                    | An `ANTHROPIC_API_KEY` with billing (see the README) | Nothing                                                                           |
| Terminal says            | `vision: claude`                                     | `vision: mock`                                                                    |
| What "Read amounts" does | Really reads the picture. Takes a few seconds        | Shows **made-up demo numbers** that do not match the picture                      |
| Cost                     | Roughly 2 to 6 US cents per reading (estimate)       | Free                                                                              |
| Say to the room          | "The AI reads the amounts"                           | "AI is switched off here, so these are placeholders. I will correct them myself." |

The sign-in code is never sent as a real text in either mode: it appears in the terminal (**Live**: Twilio sending is built but needs an account, so it is not part of the demo).

Be honest in mock mode. The screen itself says "Demo values (no AI key is set), not read from your picture." Do not pretend otherwise. Use the correction step in the story (step 5) to type the real figures from the picture.

## Sample invoices (in `docs/demo/`)

Made-up inputs, not screenshots. Regenerate with `node docs/demo/make-demo-invoices.mjs`.

| File                       | Printed Debit | Printed Credit | Expected final amount      | Mock mode: type these    |
| -------------------------- | ------------- | -------------- | -------------------------- | ------------------------ |
| `demo-1-net-debit.png`     | ₹1,25,050.00  | ₹40,000.00     | **Net Debit ₹85,050.00**   | `125050.00` / `40000.00` |
| `demo-2-net-credit.png`    | ₹30,000.00    | ₹1,12,575.00   | **Net Credit ₹82,575.00**  | `30000` / `112575`       |
| `demo-3-balanced.png`      | ₹64,000.00    | ₹64,000.00     | **Balanced ₹0.00**         | `64000` / `64000`        |
| `demo-4-tricky-blurry.jpg` | ₹2,48,025.00  | ₹91,500.00     | **Net Debit ₹1,56,525.00** | `248025` / `91500`       |

Ledgerly works in Indian rupees only, so every result shows the ₹ sign with lakh grouping (`₹85,050.00`), in both modes and when you use **Type the amounts instead**. The sample invoices are in rupees too.

**What has and has not been checked.** Mode B (mock) and the whole screen flow were run end to end on `main` while writing this, on desktop and phone sizes. Mode A (real AI) was not run, because no API key was available: the Mode A results in this script are what the app should show, so do one rehearsal with your key first.

The blurry one is a deliberately rough "phone photo": soft focus, tilted, uneven light. With the real AI it may come back with **Medium** confidence and a "double check" note, or leave a box empty with a **Please check** message. That is the app working as designed (it never guesses an amount), and a good moment to show the edit step. Rehearse it once before the demo, because the real AI has not been tested against these exact pictures.

## Before the demo (checklist)

Do this 10 minutes ahead, on the computer you will present from.

- [ ] Node is 20.12 or newer: `node -v`.
- [ ] Latest `main` is on your machine and `npm install` has been run (see the README "Run it on your computer").
- [ ] Mode A only: `server/.env` has `ANTHROPIC_API_KEY=...`, you restarted, and the terminal says `vision: claude`. Internet works.
- [ ] `npm run dev` is running and the terminal says `API listening on http://localhost:4000 (...)`.
- [ ] Open http://localhost:5173 in a clean browser window. Zoom in a notch (Ctrl/Cmd and `+`) so the back row can read it.
- [ ] Put the terminal where you can show it: the sign-in code appears there. Make the font large.
- [ ] Do one full dry run with `demo-1-net-debit.png`, then **sign out** so you start the demo from the Sign in page. (Restarting `npm run dev` also signs you out.)
- [ ] The four sample pictures are somewhere easy to find in the file picker.
- [ ] Phone view ready: either your real phone on the same Wi-Fi (README "Try it on your phone"; needs the second command with `--host`) or Chrome device mode (F12, then Ctrl/Cmd+Shift+M, pick iPhone 14).
- [ ] Silence notifications. Close tabs you do not want on screen.
- [ ] Know your number: you need a phone number in international format, for example `+44 7700 900123`. Any valid-looking number works in mock SMS mode.

## The storyline

### 1. The problem (about 45 seconds). No clicking.

**Say:** "Agents get invoices as photos or PDFs. For each one they read the Debit and the Credit by eye, subtract by hand, and write down whether it is a net debit or credit. It is slow, and one slipped digit means a wrong balance. Ledgerly takes the photo and does that for them."

Show the sample picture `demo-1-net-debit.png` on screen so people see what an agent sees: a table with a Debit column and a Credit column, and the Debit and Credit totals at the bottom.

### 2. Sign in with a text-message code (about 1 minute). **Live**

1. Open http://localhost:5173. **Expect:** the Ledgerly logo, "Read the invoice. See the balance." and a **Sign in** box with **Mobile number**.
2. Type a number with the country code, for example `+44 7700 900123`, and press **Send code**. **Expect:** "We sent a code to +44 7700 900123" and a **6-digit code** box. The button says "Resend code in 30s".
3. Switch to the terminal. **Say:** "In production this arrives as a text. In this demo it prints here." Point at the line `[sms:console] to +447700900123: Your Ledgerly code is 106950.`
4. Type the 6 digits and press **Sign in**. **Expect:** a **Welcome** page, "Signed in as +447700900123." and **Upload your invoice**.

Optional 10 seconds if asked about security: type a wrong code ("Wrong code. 4 tries left."), or press Send code twice quickly ("Please wait 30 seconds"). Codes expire in 5 minutes and sessions last 12 hours.

### 3. Upload the invoice (about 45 seconds). **Live**

1. Press **Choose file** and pick `demo-1-net-debit.png`. **Expect:** a preview, the file name and size, "Picture uploaded.", and four buttons: **Read amounts**, **Replace picture**, **Type the amounts instead**, **Remove**.
2. **Say:** "This works with JPEG, PNG, WebP and iPhone HEIC photos up to 10 MB. On a phone there is also a Take photo button."

### 4. The AI reads the amounts (about 1 minute). **Live**

1. Press **Read amounts**. **Expect:** a spinner and "Reading your invoice..." (a few seconds in Mode A, instant in Mode B), then **Amounts we found**.
2. **Mode A, expect:** Debit `125050.00`, Credit `40000.00`, "Amounts in rupees (₹)", a confidence line (High on a clean picture), and a **Lines found on the invoice** table showing Kitchen rewiring 90050.00, Materials 35000.00 and Deposit received 40000.00, with "Lines add up to" 125050.00 and 40000.00. **Say:** "It read the totals and every line, and the lines add up to the totals, which is a cross-check."
3. **Mode B, expect:** the notice "Demo values (no AI key is set), not read from your picture", and boxes with unrelated numbers such as `1484.91` and `147.63` (the demo values are small rupee amounts). **Say:** "AI is off in this run, so these are placeholders. This is exactly where an agent would check the AI's work." Move straight on to step 5. Skip the lines table; in mock mode it lists made-up lines.

### 5. Check and correct (about 1 minute). **Live**

**Say:** "The AI never has the last word. Every amount is an editable box."

1. In **Debit** type `12.345`. **Expect:** no error: any amount is accepted, with up to 12 decimal places and 15 digits before the point (the line under the boxes says so). Then type `abc` or `£5`: a red message explains why they are refused (`£5`: "Ledgerly works in rupees"). **Say:** "People can type whatever amount they like. It only refuses what is not a number, and it never rounds behind your back."
2. Mode B: set Debit to `125050.00` and Credit to `40000.00` (the figures printed on the picture). Mode A: the figures are already right; to show a fix, change Credit to `45000.00`, then use **Reset to what was found** to get `40000.00` back.
3. Optional: refresh the page. **Expect:** your edits are still there. (The picture itself is already deleted from the server once read. **Say:** "We do not keep invoice pictures after reading them.")

### 6. The final amount (about 1 minute). **Live**

1. Press **Calculate final amount**. **Expect:** **Final amount**, the label **NET DEBIT**, `₹85,050.00` in large type, the working `Debit ₹1,25,050.00 − Credit ₹40,000.00 = ₹85,050.00`, and **How it was worked out**.
2. Under **Change an amount**, set Credit to `200000`. **Expect:** it flips to **NET CREDIT** immediately, no button needed. Set Credit equal to Debit (`125050`): **BALANCED**. Put Credit back to `40000`.
3. Show an amount with many decimals: set Debit to `12.345` and clear Credit. **Expect:** `₹12.35` in large type with the note "Shown rounded to 2 decimal places. The exact amount is ₹12.345." and the working showing `₹12.345`. **Say:** "The big figure is rounded to 2 decimals for reading; the working keeps every decimal, and nothing is rounded in the maths." Put the amounts back.
4. Press **Copy result** and paste into any notes app. **Expect:** one line such as `Net Debit ₹85,050.00 (Debit ₹1,25,050.00 − Credit ₹40,000.00)`. **Say:** "That is the line an agent can paste straight into their system."
5. **Say (one sentence):** "The sums are exact decimals, never floating point, so `0.30 + 0.10` is exactly `0.40`."

Optional, if time: press **Start a new invoice** and run `demo-2-net-credit.png` (Net Credit 825.75) or `demo-4-tricky-blurry.jpg` (the rough photo).

### 7. On a phone (about 45 seconds). **Live**

1. Open the app on the phone (or device mode). Sign in the same way; the code is still in the computer's terminal.
2. **Expect:** the same flow, laid out for one hand: big buttons, the camera option **Take photo**, and the same result screen. **Say:** "Same app on web and phone. A real iOS and Android app is the next packaging step."
3. Dark mode: switch the phone or computer to dark mode and the colours change on their own.

### 8. What is next (about 45 seconds). **Roadmap, none of this is built**

**Say:** "What you have seen is the core loop. Next:"

- **Line-item totals.** Real invoices can have long lists. The maths already adds up lists of signed lines; the screen to review and total long lists is next.
- **Agents and a superadmin.** Agent accounts, a superadmin who sees across agents, and roles. (Not designed in detail yet; this is the next phase.)
- **Saving and history.** Today nothing is kept after you finish: pictures are deleted after reading and the result is not stored. A history per agent comes with the accounts work.
- **iOS and Android apps.** The web app is built mobile-first and is meant to be wrapped as a store app. It is not wrapped yet.
- **Real text messages.** Twilio sending is built but needs a Twilio account to switch on.

Then stop and take questions.

## If something goes wrong

| Problem                                                                  | What to do                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI is slow or says "Reading the invoice took too long"                   | The picture is kept. Press **Read amounts** once more. If it fails again, press **Type the amounts instead** and type the figures from the picture. Say "I will enter them by hand so we can see the calculation."                        |
| "Could not reach the AI service" or "AI reading is not set up correctly" | No internet or a bad key. Switch to Mode B: in `server/.env` empty the key line (or set `VISION_PROVIDER=mock`), restart `npm run dev`, and sign in again (restarting signs everyone out). The Mode B column above tells you what to say. |
| The AI returned an empty box and **Please check**                        | Working as designed: it will not guess an unclear amount. Type the figure yourself and continue. This is a good point to make about trust.                                                                                                |
| "The AI service is busy"                                                 | Wait the stated time, or switch to Mode B.                                                                                                                                                                                                |
| Code is not in the terminal                                              | Scroll the terminal or check you are looking at the window running `npm run dev`. Press **Resend code** after 30 seconds (the new code is a new line).                                                                                    |
| Back on the Sign in page unexpectedly                                    | The server restarted. Sign in again.                                                                                                                                                                                                      |
| Phone cannot open the page                                               | Wi-Fi mismatch or firewall. Fall back to Chrome device mode on the computer, which looks the same.                                                                                                                                        |
| Everything is broken                                                     | Say "let me show you the screens", and open the sample picture `demo-1-net-debit.png` plus your screenshots if you have them. Nothing in the story needs the internet apart from Mode A.                                                  |

## Reset between runs

Press **Sign out**. To start completely fresh stop the app with `Ctrl+C` and run `npm run dev` again.
