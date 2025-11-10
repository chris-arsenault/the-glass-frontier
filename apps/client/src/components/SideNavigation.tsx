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

export function SideNavigation() {
  const toggleDrawer = useUiStore((state) => state.toggleCharacterDrawer);
  const isOpen = useUiStore((state) => state.isCharacterDrawerOpen);

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
      </div>
      <SessionManager />
    </nav>
  );
}
