import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

// Top bar for signed-in pages: logo on the left, page actions on the right.
export default function AppHeader({ children }) {
  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <Link to="/" className="brand-link" aria-label="Ledgerly home">
          <Logo height={36} />
        </Link>
        <div className="topbar-actions">{children}</div>
      </div>
    </header>
  );
}
