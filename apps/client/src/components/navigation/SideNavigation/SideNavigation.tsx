import { SessionManager } from '../../session/SessionManager/SessionManager';
import './SideNavigation.css';

export function SideNavigation() {
  return (
    <nav className="app-nav" aria-label="Primary">
      <SessionManager />
    </nav>
  );
}
