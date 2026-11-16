import { useAuth } from '../auth/AuthContext.jsx';
import AppHeader from '../components/AppHeader.jsx';
import useDocumentTitle from '../useDocumentTitle.js';

// Protected landing page. The upload, review and result screens replace the
// placeholder below in later steps. The header sits outside <main> so it is
// exposed as the page's banner landmark.
export default function HomePage() {
  const { user, logout } = useAuth();
  useDocumentTitle();
  return (
    <>
      <AppHeader>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </AppHeader>
      <main className="shell">
        <h1>Welcome</h1>
        <p>
          Signed in as <strong>{user.phone}</strong>.
        </p>
        <p className="hint">Invoice upload comes next.</p>
      </main>
    </>
  );
}
