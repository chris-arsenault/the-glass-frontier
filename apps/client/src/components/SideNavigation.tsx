import { useUiStore } from "../stores/uiStore";
import { SessionManager } from "./SessionManager";

const CharacterIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.33 0-6 2-6 4v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1c0-2-2.67-4-6-4Z"
    />
  </svg>
);

const TemplateIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 4h9l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 0v3h3"
    />
    <path
      fill="currentColor"
      d="M8 9h8v2H8zm0 4h8v2H8zm0 4h4v2H8z"
    />
  </svg>
);

export function SideNavigation() {
  const toggleDrawer = useUiStore((state) => state.toggleCharacterDrawer);
  const isOpen = useUiStore((state) => state.isCharacterDrawerOpen);
  const toggleTemplateDrawer = useUiStore((state) => state.toggleTemplateDrawer);
  const isTemplateDrawerOpen = useUiStore((state) => state.isTemplateDrawerOpen);

  return (
    <nav className="app-nav" aria-label="Primary">
      <div className="app-nav-buttons">
        <button
          type="button"
          className={`app-nav-item${isOpen ? " active" : ""}`}
          onClick={toggleDrawer}
          aria-pressed={isOpen}
        >
          <CharacterIcon />
          <span>Character</span>
        </button>
        <button
          type="button"
          className={`app-nav-item${isTemplateDrawerOpen ? " active" : ""}`}
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
