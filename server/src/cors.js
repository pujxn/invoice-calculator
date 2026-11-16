// Cross-origin access for the Ledgerly iOS and Android apps.
//
// The web app talks to the API from the same origin (the Vite proxy in development, one host in
// production), so it needs none of this. The native apps load their pages from the phone
// (capacitor://localhost on iOS, https://localhost on Android) and call the API on another host,
// so the webview asks "may this origin read your answers?" first.
//
// Sign-in uses a bearer token in the Authorization header, never cookies, so nothing is sent
// automatically and credentials are not allowed. Only the origins listed in the config get the
// permission headers; for any other origin the headers are left out and the browser blocks the
// answer, which is the same as before this file existed.
export function createCors({ origins }) {
  const allowed = new Set(origins);
  return function cors(req, res, next) {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return next();

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');

    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      // A preflight: answer it here, without signing in, and do not run the real route.
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
    next();
  };
}
