import { useAuth } from '../auth/AuthContext.jsx';
import AppHeader from '../components/AppHeader.jsx';
import InvoiceFlow from '../invoices/InvoiceFlow.jsx';
import useDocumentTitle from '../useDocumentTitle.js';

// Protected landing page: the upload screen. The header sits outside <main> so it is
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
        <p>
          Signed in as <strong>{user.phone}</strong>.
        </p>
        <InvoiceFlow />
      </main>
    </>
  );
}
