import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AppHeader from './AppHeader.jsx';

// The header of every signed-in page: logo, the links this role needs, and Sign out.
// Agents get New invoice and My list; superadmins get Agents.
export default function SignedInHeader() {
  const { user, logout } = useAuth();
  const admin = user.role === 'superadmin';
  const links = admin
    ? [{ to: '/admin', label: 'Agents' }]
    : [
        { to: '/', label: 'New invoice', end: true },
        { to: '/list', label: 'My list' },
      ];
  return (
    <AppHeader
      wide={admin}
      nav={
        <nav aria-label="Main" className="mainnav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      }
    >
      <button type="button" className="secondary" onClick={logout}>
        Sign out
      </button>
    </AppHeader>
  );
}
