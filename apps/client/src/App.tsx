import { ChatCanvas } from "./components/ChatCanvas";
import { ChatComposer } from "./components/ChatComposer";
import { SideNavigation } from "./components/SideNavigation";
import { CharacterDrawer } from "./components/CharacterDrawer";
import { useAuthStore } from "./stores/authStore";
import { LoginScreen } from "./components/LoginScreen";
import { useLoginResources } from "./hooks/useLoginResources";
import { useProgressStreamConnection } from "./hooks/useProgressStreamConnection";
import { CreateCharacterModal } from "./components/CreateCharacterModal";
import { useChronicleStore } from "./stores/chronicleStore";
import { ChronicleHeader } from "./components/ChronicleHeader";
import { MomentumIndicator } from "./components/MomentumIndicator";
import { TemplateDrawer } from "./components/TemplateDrawer";

function SessionMeta() {
  const character = useChronicleStore((state) => state.character);
  const loginLabel = useChronicleStore((state) => state.loginName ?? state.loginId);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);

  return (
    <div className="session-meta">
      {loginLabel ? <p className="app-session-id">Login {loginLabel}</p> : null}
      {character ? (
        <div className="character-pill">
          <span className="character-pill-name">{character.name}</span>
          <span className="character-pill-detail">{character.archetype}</span>
          <span className="character-pill-momentum">
            Momentum <MomentumIndicator momentum={character.momentum} trend={momentumTrend} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  useLoginResources(isAuthenticated);
  useProgressStreamConnection(isAuthenticated);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="app-layout">
          <SideNavigation />
          <div className="app-content">
            <div className="app-body">
              <main className="app-main">
                <div className="session-bar">
                  <ChronicleHeader />
                  <SessionMeta />
                </div>
                <ChatCanvas />
                <ChatComposer />
              </main>
            </div>
          </div>
        </div>
      </div>
      <CharacterDrawer />
      <TemplateDrawer />
      <CreateCharacterModal />
    </div>
  );
}
