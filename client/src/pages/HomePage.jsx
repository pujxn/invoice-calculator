import { useAuth } from '../auth/AuthContext.jsx';
import InvoiceUpload from '../invoices/InvoiceUpload.jsx';

// Protected landing page: the upload screen. Review and result screens follow in later steps.
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
      <InvoiceUpload />
    </main>
  );
}
