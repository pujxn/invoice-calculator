// What the web app keeps in the browser, in one place.
//   localStorage    SESSION_KEY: the sign-in token (until it expires or the user signs out)
//   sessionStorage  the picture being worked on and the amounts that were read from it
//                   (this tab only, gone when the tab closes, and cleared on sign out)
export const SESSION_KEY = 'invoice-calculator.session';
export const PICTURE_KEY = 'invoice-calculator.current-invoice';
export const READING_KEY = 'invoice-calculator.extracted';
// How the person chose to read pictures ("ocr" or "claude"): a preference, kept for this tab.
export const METHOD_KEY = 'invoice-calculator.reading-method';

// Signing out must not leave one person's invoice amounts behind for the next sign-in.
export function forgetInvoiceData() {
  try {
    sessionStorage.removeItem(PICTURE_KEY);
    sessionStorage.removeItem(READING_KEY);
  } catch {
    // storage blocked: nothing was kept
  }
}
