import { Routes, Route, Navigate } from 'react-router-dom';

import { ChangelogModal } from './components/ChangelogModal';
import { CharacterDrawer } from './components/CharacterDrawer';
import { ChatCanvas } from './components/ChatCanvas';
import { ChatComposer } from './components/ChatComposer';
import { ChronicleHeader } from './components/ChronicleHeader';
import { CreateCharacterModal } from './components/CreateCharacterModal';
import { LoginScreen } from './components/LoginScreen';
import { PlayerMenu } from './components/PlayerMenu';
import { SideNavigation } from './components/SideNavigation';
import { TemplateDrawer } from './components/TemplateDrawer';
import { ChronicleStartWizard } from './features/chronicleStart/ChronicleStartWizard';
import { useLoginResources } from './hooks/useLoginResources';
import { useProgressStreamConnection } from './hooks/useProgressStreamConnection';
import { useAuthStore } from './stores/authStore';
import { useUiStore } from './stores/uiStore';

const SessionMeta = (): JSX.Element => {
  const openChangelog = useUiStore((state) => state.openChangelogModal);

  return (
    <div className="session-meta">
      <div className="session-meta-actions">
        <PlayerMenu />
        <button
          type="button"
          className="session-changelog-button"
          onClick={openChangelog}
          aria-label="Show recent changes"
          title="View what's new"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            role="img"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M6 4.5v15l6-3 6 3v-15l-6 3-6-3z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

const ChatExperience = (): JSX.Element => {
  return (
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
  );
};

export function App(): JSX.Element {
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
            <Routes>
              <Route path="/" element={<ChatExperience />} />
              <Route path="/chronicles/start" element={<ChronicleStartWizard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
      <CharacterDrawer />
      <TemplateDrawer />
      <CreateCharacterModal />
      <ChangelogModal />
    </div>
  );
}
