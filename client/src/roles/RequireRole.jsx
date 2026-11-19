import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Inside RequireAuth: only lets one role through. Anyone else goes to their own home page.
export default function RequireRole({ role }) {
  const { user } = useAuth();
  if (user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
