# Free OCR accuracy

How well the free local OCR reader (Tesseract, see `server/src/extraction/providers/ocr*.js`) reads the Debit and Credit amounts, measured before and after the tuning of 2026-11-23. "Before" is `main` at that date; "after" is the tuned reader with per-amount confidence flags.

## Summary

Over 192 amounts on 96 test invoices (two sets of 48, below):

- **Right:** 34 (18%) before, **83 (43%) after**.
- **Wrong** (a different number in the box): 7 (4%) before, 16 (8%) after. The extra wrong readings are all on handwriting-style pictures, where the old reader mostly left the box empty. 15 of the 16 wrong amounts were flagged **Low confidence** (pink, "please double-check").
- **High confidence** was right 62 times out of 63. The one miss is a handwriting font whose 7 looks like a 1: every reading agreed on the wrong digit, so no amount of re-reading could catch it.
- **Low confidence** was right 21 times out of 36: treat pink amounts as a draft.
- **Left empty** (type it in): 93 (48%), mostly handwriting the engine cannot read at all.
- **Time per picture:** 7.6 s before, 3.9 s after (on a 4-core cloud machine, two benchmarks at once).

Printed invoices are now read well, including blurry, tilted phone photos on a desk. Handwriting-style amounts are read right about one time in five (up from one in thirty), and are usually flagged Low; the AI reader (Claude) is the better choice for handwriting.

## The sample invoices (`docs/demo/`)

| File                       | Printed (Debit / Credit) | Read after           | Flags       | Time  |
| -------------------------- | ------------------------ | -------------------- | ----------- | ----- |
| `demo-1-net-debit.png`     | 125050.00 / 40000.00     | 125050.00 / 40000.00 | high / high | 2.4 s |
| `demo-2-net-credit.png`    | 30000.00 / 112575.00     | 30000.00 / 112575.00 | high / high | 1.8 s |
| `demo-3-balanced.png`      | 64000.00 / 64000.00      | 64000.00 / 64000.00  | high / high | 1.6 s |
| `demo-4-tricky-blurry.jpg` | 248025.00 / 91500.00     | 248025.00 / 91500.00 | high / low  | 1.9 s |

All four were also read right before (they were the original test pictures), but only at "Medium" with no per-amount flag.

## Test set 1 (tuned on)

| Pictures                       | Amounts | Before: right | Before: wrong | After: right | After: wrong | After: left empty |
| ------------------------------ | ------- | ------------- | ------------- | ------------ | ------------ | ----------------- |
| Printed, clean scan            | 16      | 8 (50%)       | 0 (0%)        | 16 (100%)    | 0 (0%)       | 0 (0%)            |
| Printed, phone photo           | 16      | 4 (25%)       | 0 (0%)        | 11 (69%)     | 0 (0%)       | 5 (31%)           |
| Handwriting-style, clean       | 32      | 1 (3%)        | 1 (3%)        | 7 (22%)      | 2 (6%)       | 23 (72%)          |
| Handwriting-style, phone photo | 32      | 4 (12%)       | 2 (6%)        | 10 (31%)     | 5 (16%)      | 17 (53%)          |
| **All**                        | 96      | 17 (18%)      | 3 (3%)        | 44 (46%)     | 7 (7%)       | 45 (47%)          |

## Test set 2 (held out: different amounts, tilt and blur; not looked at while tuning)

| Pictures                       | Amounts | Before: right | Before: wrong | After: right | After: wrong | After: left empty |
| ------------------------------ | ------- | ------------- | ------------- | ------------ | ------------ | ----------------- |
| Printed, clean scan            | 16      | 8 (50%)       | 0 (0%)        | 16 (100%)    | 0 (0%)       | 0 (0%)            |
| Printed, phone photo           | 16      | 6 (38%)       | 0 (0%)        | 12 (75%)     | 0 (0%)       | 4 (25%)           |
| Handwriting-style, clean       | 32      | 1 (3%)        | 3 (9%)        | 5 (16%)      | 5 (16%)      | 22 (69%)          |
| Handwriting-style, phone photo | 32      | 2 (6%)        | 1 (3%)        | 6 (19%)      | 4 (12%)      | 22 (69%)          |
| **All**                        | 96      | 17 (18%)      | 4 (4%)        | 39 (41%)     | 9 (9%)       | 48 (50%)          |

## What the pictures are

Made-up invoices drawn by `server/bench/make-corpus.mjs`: 4 printed fonts and 8 handwriting-style fonts (Caveat, Patrick Hand, Reenie Beanie, Shadows Into Light, Kalam, Permanent Marker, Indie Flower, Homemade Apple), each drawn four ways: label and amount on one line, and the amount under its label (or in "Debit Credit" columns), each as a clean scan and as a rough phone photo (on a dark desk, tilted up to 4 degrees, blurred 0.8 to 2.2 px, uneven light, JPEG quality 50). Half the handwriting is on ruled paper. Amounts are 4 to 7 digits in plain, lakh (`2,48,025`) or western (`248,025.00`) grouping, no currency sign. Handwriting fonts are a stand-in for real handwriting: real writing varies more, so expect real results to be somewhat worse.

## Run it yourself

```
mkdir -p /tmp/ledgerly-fonts && cd /tmp/ledgerly-fonts && npm init -y >/dev/null
npm i @fontsource/caveat @fontsource/patrick-hand @fontsource/reenie-beanie @fontsource/shadows-into-light @fontsource/kalam @fontsource/permanent-marker @fontsource/indie-flower @fontsource/homemade-apple
cd -   # back to the project folder
FONT_DIR=/tmp/ledgerly-fonts node server/bench/make-corpus.mjs /tmp/ledgerly-corpus
node server/bench/run-bench.mjs /tmp/ledgerly-corpus
```

`SEED=777` before `make-corpus.mjs` draws test set 2. `run-bench.mjs` prints one line per picture (right, empty or WRONG for each amount, with its flag) and a summary; `--json out.json` saves the details and `--only <pattern>` runs some pictures only. The fonts are only needed to draw the pictures and are not part of the app.

## What changed in the reader

1. The page is cut out of the desk around it (largest bright area) after straightening, so the text is bigger and no dark border confuses the engine.
2. Up to five whole-page readings with different clean-ups: plain; light evened out and ruled lines rubbed out; the same in black and white; local contrast; hard contrast. It stops once two agree.
3. Amounts are found beside their label and also under it (label on one line and the amount on the next, or headings in columns). An amount beside its label wins over one below (that may be a table column). Handwritten labels that lose a letter (`Cred`, `Debi`) count.
4. Each amount found is read again three times as a digits-only close-up. A close-up can confirm an amount but never invent one, and when close-ups were taken at least one must agree before the box is filled.
5. **High** only when two whole-page readings and two close-ups agree, nothing else was read, and the engine's own word confidence is at least 60. Anything filled in short of that is **Low**.
