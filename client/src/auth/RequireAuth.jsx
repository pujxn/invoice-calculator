import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Wrap protected routes: <Route element={<RequireAuth />}> ...children... </Route>
export default function RequireAuth() {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking)
    return (
      <main className="shell">
        <p>Checking your session…</p>
      </main>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
