import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api.js';

import { SESSION_KEY as STORAGE_KEY, forgetInvoiceData } from '../storageKeys.js';
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
    forgetInvoiceData();
    setSession(null);
  }, []);

  // Signing out (or being signed out) in another tab of this browser signs this tab out too,
  // and signing in elsewhere signs this one in, instead of leaving a page that no longer works.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      const stored = loadStored();
      setSession((current) => {
        if (!stored) return null;
        return current?.token === stored.token ? current : stored;
      });
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const stored = loadStored();
    if (!stored) return;
    let cancelled = false;
    api('/auth/me', { token: stored.token })
      .then((me) => {
        if (!cancelled) setSession({ ...stored, phone: me.phone, name: me.name, role: me.role });
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
    const next = { token, expiresAt, phone: me.phone, name: me.name, role: me.role };
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
      // role is "agent" or "superadmin". A session saved before roles existed has none; the
      // check with the server on load fills it in, and the server enforces the role anyway.
      user: session
        ? { phone: session.phone, name: session.name ?? '', role: session.role ?? 'agent' }
        : null,
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
