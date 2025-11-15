import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';

import { LoginScreen } from './components/auth/LoginScreen/LoginScreen';
import { CharacterDrawer } from './components/drawers/CharacterDrawer/CharacterDrawer';
import { TemplateDrawer } from './components/drawers/TemplateDrawer/TemplateDrawer';
import { ChatCanvas } from './components/layout/ChatCanvas/ChatCanvas';
import { ChatComposer } from './components/layout/ChatComposer/ChatComposer';
import { ChronicleHeader } from './components/layout/ChronicleHeader/ChronicleHeader';
import { BugReportModal } from './components/modals/BugReportModal/BugReportModal';
import { ChangelogModal } from './components/modals/ChangelogModal/ChangelogModal';
import { CreateCharacterModal } from './components/modals/CreateCharacterModal/CreateCharacterModal';
import { PlayerSettingsModal } from './components/modals/PlayerSettingsModal/PlayerSettingsModal';
import { UserGuideModal } from './components/modals/UserGuideModal/UserGuideModal';
import { AuditReviewPage } from './components/moderation/AuditReviewPage/AuditReviewPage';
import { LocationMaintenancePage } from './components/moderation/LocationMaintenancePage/LocationMaintenancePage';
import { SideNavigation } from './components/navigation/SideNavigation/SideNavigation';
import { LandingPage } from './components/pages/LandingPage/LandingPage';
import { PlayerMenu } from './components/widgets/PlayerMenu/PlayerMenu';
import { ChronicleStartWizard } from './components/wizards/ChronicleStartWizard/ChronicleStartWizard';
import { useLoginResources } from './hooks/useLoginResources';
import { useProgressStreamConnection } from './hooks/useProgressStreamConnection';
import { useAuthStore } from './stores/authStore';
import { useChronicleStore } from './stores/chronicleStore';
import { useUiStore } from './stores/uiStore';
import './App.css';

const SiteHeader = (): JSX.Element => {
  const openChangelog = useUiStore((state) => state.openChangelogModal);
  const openBugReport = useUiStore((state) => state.openBugReportModal);
  const openGuide = useUiStore((state) => state.openGuideModal);

  return (
    <header className="app-global-header">
      <div className="session-meta">
        <div className="session-meta-actions">
          <button type="button" className="session-report-button" onClick={openBugReport}>
            Report Bug
          </button>
          <button type="button" className="session-guide-button" onClick={openGuide}>
            User Guide
          </button>
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
          <PlayerMenu />
        </div>
      </div>
    </header>
  );
};

const ChatExperience = (): JSX.Element => {
  return (
    <div className="app-layout">
      <SideNavigation />
      <div className="app-content">
        <div className="app-body">
          <main className="app-main">
            <div className="session-bar">
              <ChronicleHeader />
            </div>
            <ChatCanvas />
            <ChatComposer />
          </main>
        </div>
      </div>
    </div>
  );
};

const ChronicleRoute = (): JSX.Element => {
  const { chronicleId: routeChronicleId } = useParams();
  const navigate = useNavigate();
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const chronicleCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const pendingChronicleRef = useRef<string | null>(null);
  const failedChronicleRef = useRef<string | null>(null);
  const [routeError, setRouteError] = useState<{ chronicleId: string; message: string } | null>(
    null
  );

  useEffect(() => {
    if (chronicleCharacterId) {
      setPreferredCharacterId(chronicleCharacterId);
    }
  }, [chronicleCharacterId, setPreferredCharacterId]);

  useEffect(() => {
    if (!routeChronicleId) {
      return;
    }
    if (currentChronicleId === routeChronicleId) {
      return;
    }
    if (
      pendingChronicleRef.current === routeChronicleId ||
      failedChronicleRef.current === routeChronicleId
    ) {
      return;
    }
    let cancelled = false;
    pendingChronicleRef.current = routeChronicleId;

    const loadChronicle = async () => {
      try {
        await hydrateChronicle(routeChronicleId);
        if (cancelled) {
          return;
        }
        if (pendingChronicleRef.current === routeChronicleId) {
          pendingChronicleRef.current = null;
        }
        failedChronicleRef.current = null;
        setRouteError((prev) => (prev?.chronicleId === routeChronicleId ? null : prev));
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to load chronicle. Returning to landing.';
        failedChronicleRef.current = routeChronicleId;
        setRouteError({ chronicleId: routeChronicleId, message });
        if (pendingChronicleRef.current === routeChronicleId) {
          pendingChronicleRef.current = null;
        }
      }
    };

    void loadChronicle();

    return () => {
      cancelled = true;
      if (pendingChronicleRef.current === routeChronicleId) {
        pendingChronicleRef.current = null;
      }
    };
  }, [hydrateChronicle, routeChronicleId, currentChronicleId]);

  if (!routeChronicleId) {
    return <Navigate to="/" replace />;
  }

  const isLoading =
    connectionState === 'connecting' || currentChronicleId !== routeChronicleId;
  const activeRouteError =
    routeError && routeError.chronicleId === routeChronicleId ? routeError.message : null;

  if (activeRouteError) {
    return (
      <div className="chronicle-route-state">
        <p>{activeRouteError}</p>
        <button
          type="button"
          onClick={() => {
            void navigate('/', { replace: true });
          }}
        >
          Return to landing
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="chronicle-route-state">
        <p>Loading chronicle…</p>
      </div>
    );
  }

  return <ChatExperience />;
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
        <SiteHeader />
        <div className="app-route-surface">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/chronicle/:chronicleId" element={<ChronicleRoute />} />
            <Route path="/chronicle" element={<Navigate to="/" replace />} />
            <Route path="/chronicles/start" element={<ChronicleStartWizard />} />
            <Route path="/moderation/audit" element={<AuditReviewPage />} />
            <Route path="/moderation/locations" element={<LocationMaintenancePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      <CharacterDrawer />
      <TemplateDrawer />
      <CreateCharacterModal />
      <BugReportModal />
      <ChangelogModal />
      <PlayerSettingsModal />
      <UserGuideModal />
    </div>
  );
}
