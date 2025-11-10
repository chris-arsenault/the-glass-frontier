import { ChatCanvas } from "./components/ChatCanvas";
import { ChatComposer } from "./components/ChatComposer";
import { useSessionStore } from "./stores/sessionStore";
import { useSessionNarrationConnection } from "./hooks/useSessionNarrationConnection";
import { SideNavigation } from "./components/SideNavigation";
import { CharacterDrawer } from "./components/CharacterDrawer";
import { useAuthStore } from "./stores/authStore";
import { LoginScreen } from "./components/LoginScreen";

function SessionMeta() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const character = useSessionStore((state) => state.character);
  const loginLabel = useSessionStore((state) => state.loginName ?? state.loginId);

  return (
    <div className="session-meta">
      {sessionId ? <p className="app-session-id">Session {sessionId}</p> : null}
      {loginLabel ? <p className="app-session-id">Login {loginLabel}</p> : null}
      {character ? (
        <div className="character-pill">
          <span className="character-pill-name">{character.name}</span>
          <span className="character-pill-detail">{character.archetype}</span>
          <span className="character-pill-momentum">Momentum {character.momentum.current}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  useSessionNarrationConnection(isAuthenticated);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="app-layout">
          <SideNavigation />
          <div className="app-content">
            <header className="app-header">
              <h1 className="app-title">The Glass Frontier</h1>
              <SessionMeta />
            </header>
            <div className="app-body">
              <main className="app-main">
                <ChatCanvas />
                <ChatComposer />
              </main>
            </div>
          </div>
        </div>
      </div>
      <CharacterDrawer />
    </div>
  );
}
