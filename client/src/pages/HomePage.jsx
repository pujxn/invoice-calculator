import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SignedInHeader from '../components/SignedInHeader.jsx';
import InvoiceFlow from '../invoices/InvoiceFlow.jsx';
import useDocumentTitle from '../useDocumentTitle.js';

// Protected landing page. Agents get the new-invoice screens; a superadmin goes to the agents page.
// The header sits outside <main> so it is exposed as the page's banner landmark.
export default function HomePage() {
  const { user } = useAuth();
  useDocumentTitle();
  if (user.role === 'superadmin') return <Navigate to="/admin" replace />;
  return (
    <>
      <SignedInHeader />
      <main className="shell">
        <h1>Welcome{user.name ? `, ${user.name}` : ''}</h1>
        <p>
          Signed in as <strong>{user.phone}</strong>.
        </p>
        <InvoiceFlow key={user.phone} />
      </main>
    </>
  );
}
