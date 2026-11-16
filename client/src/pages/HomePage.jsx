import { useAuth } from '../auth/AuthContext.jsx';

// Protected landing page. The upload, review and result screens replace the
// placeholder below in later steps.
export default function HomePage() {
  const { user, logout } = useAuth();
  return (
    <main className="shell">
      <header className="topbar">
        <h1>Invoice Calculator</h1>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </header>
      <p>
        Signed in as <strong>{user.phone}</strong>.
      </p>
      <p className="hint">Invoice upload comes next.</p>
    </main>
  );
}
