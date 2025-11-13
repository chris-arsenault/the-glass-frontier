import { useUiStore } from '../../../stores/uiStore';
import { SessionManager } from '../../session/SessionManager/SessionManager';
import './SideNavigation.css';

const TemplateIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 4h9l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 0v3h3"
    />
    <path fill="currentColor" d="M8 9h8v2H8zm0 4h8v2H8zm0 4h4v2H8z" />
  </svg>
);

export function SideNavigation() {
  const toggleTemplateDrawer = useUiStore((state) => state.toggleTemplateDrawer);
  const isTemplateDrawerOpen = useUiStore((state) => state.isTemplateDrawerOpen);

  return (
    <nav className="app-nav" aria-label="Primary">
      <div className="app-nav-buttons">
        <button
          type="button"
          className={`app-nav-item${isTemplateDrawerOpen ? ' active' : ''}`}
          onClick={toggleTemplateDrawer}
          aria-pressed={isTemplateDrawerOpen}
        >
          <TemplateIcon />
          <span>Templates</span>
        </button>
      </div>
      <SessionManager />
    </nav>
  );
}
