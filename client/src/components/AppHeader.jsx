import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

// Top bar for signed-in pages: logo on the left, page actions on the right.
// `nav` is the main navigation (see MainNav), shown in a row under the logo; `wide` lines the bar up
// with the wider admin pages.
export default function AppHeader({ children, nav = null, wide = false }) {
  return (
    <header className="topbar-wrap">
      <div className={`topbar${wide ? ' wide' : ''}`}>
        <Link to="/" className="brand-link" aria-label="Ledgerly home">
          <Logo height={36} />
        </Link>
        <div className="topbar-actions">{children}</div>
      </div>
      {nav && <div className={`topbar${wide ? ' wide' : ''} topbar-nav`}>{nav}</div>}
    </header>
  );
}
