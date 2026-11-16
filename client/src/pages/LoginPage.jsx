import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Logo from '../components/Logo.jsx';
import useDocumentTitle from '../useDocumentTitle.js';

// Two steps: enter the mobile number, then the 6-digit code from the SMS.
export default function LoginPage() {
  const { user, requestCode, verifyCode } = useAuth();
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  async function send() {
    setError('');
    setBusy(true);
    try {
      const res = await requestCode(phone);
      setCooldown(res.resendAfterSeconds);
      setCode('');
      setStep('code');
    } catch (err) {
      if (err.data?.retryAfterSeconds) setCooldown(err.data.retryAfterSeconds);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone(e) {
    e.preventDefault();
    await send();
  }

  async function submitCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyCode(phone, code);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="shell login">
      <div className="login-brand">
        <Logo height={56} />
        <p className="tagline">Read the invoice. See the balance.</p>
      </div>
      <h1>Sign in</h1>
      {step === 'phone' ? (
        <form onSubmit={submitPhone} noValidate>
          <label htmlFor="phone">Mobile number</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+44 7700 900123"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          <p className="hint">Include the country code. We will text you a 6-digit code.</p>
          {error && (
            <p className="status bad" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !phone.trim()}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <p>
            We sent a code to <strong>{phone}</strong>.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep('phone');
                setError('');
              }}
            >
              Change number
            </button>
          </p>
          <label htmlFor="code">6-digit code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          {error && (
            <p className="status bad" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || cooldown > 0}
            onClick={send}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
      )}
    </main>
  );
}
