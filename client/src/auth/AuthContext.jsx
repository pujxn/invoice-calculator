import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api.js';

const STORAGE_KEY = 'invoice-calculator.session';
const AuthContext = createContext(null);

// localStorage can be blocked (private mode), so every access is guarded.
function loadStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.token && new Date(stored.expiresAt) > new Date()) return stored;
  } catch {
    // fall through: treat as signed out
  }
  return null;
}

function store(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // session then lasts only until the page is closed
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadStored);
  // With a stored token we confirm it with the server before showing protected pages.
  const [checking, setChecking] = useState(() => loadStored() !== null);

  const clear = useCallback(() => {
    store(null);
    setSession(null);
  }, []);

  useEffect(() => {
    const stored = loadStored();
    if (!stored) return;
    let cancelled = false;
    api('/auth/me', { token: stored.token })
      .then((me) => {
        if (!cancelled) setSession({ ...stored, phone: me.phone });
      })
      .catch((err) => {
        // Only a 401 means the token is dead; a network blip keeps the session.
        if (!cancelled && err instanceof ApiError && err.status === 401) clear();
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const requestCode = useCallback(
    (phone) => api('/auth/request-otp', { method: 'POST', body: { phone } }),
    [],
  );

  const verifyCode = useCallback(async (phone, code) => {
    const { token, expiresAt } = await api('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code },
    });
    const me = await api('/auth/me', { token });
    const next = { token, expiresAt, phone: me.phone };
    store(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    const token = session?.token;
    clear();
    // Best effort: the local session is already gone even if this call fails.
    if (token) await api('/auth/logout', { method: 'POST', token }).catch(() => {});
  }, [session, clear]);

  const value = useMemo(
    () => ({
      user: session ? { phone: session.phone } : null,
      token: session?.token ?? null,
      checking,
      requestCode,
      verifyCode,
      logout,
    }),
    [session, checking, requestCode, verifyCode, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
