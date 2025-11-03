import { useEffect } from "react";
import { SessionProvider } from "./context/SessionContext.jsx";
import { AccountProvider, useAccountContext } from "./context/AccountContext.jsx";
import { useSessionConnection } from "./hooks/useSessionConnection.js";
import { ChatCanvas } from "./components/ChatCanvas.jsx";
import { ChatComposer } from "./components/ChatComposer.jsx";
import { SessionMarkerRibbon } from "./components/SessionMarkerRibbon.jsx";
import { OverlayDock } from "./components/OverlayDock.jsx";
import { AccountGate } from "./components/AccountGate.jsx";
import { SessionDashboard } from "./components/SessionDashboard.jsx";
import { AdminVerbCatalogPanel } from "./components/AdminVerbCatalogPanel.jsx";

export default function App() {
  return (
    <AccountProvider>
      <AccountBoundary />
    </AccountProvider>
  );
}

export function AccountBoundary() {
  const { status, isAuthenticated } = useAccountContext() || {};

  if (status === "checking") {
    return (
      <div className="account-loading" role="status" aria-live="polite">
        Verifying authentication…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AccountGate />;
  }

  return <SessionWorkspace />;
}

export function SessionWorkspace() {
  const {
    selectedSessionId,
    account,
    token,
    activeView,
    setActiveView,
    isAdmin,
    logout,
    flashMessage,
    clearFlashMessage
  } = useAccountContext();

  useEffect(() => {
    if (!isAdmin && activeView === "admin") {
      setActiveView("session");
    }
  }, [activeView, isAdmin, setActiveView]);

  if (!selectedSessionId) {
    return <SessionDashboard />;
  }

  const session = useSessionConnection({ sessionId: selectedSessionId, account, authToken: token });

  return (
    <SessionProvider value={session}>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="app-title">The Glass Frontier</p>
            <p className="app-session-id" aria-live="polite">
              Session: <strong>{session.sessionId}</strong>
            </p>
          </div>
          <div className="app-account">
            <div>
              <p className="app-account-name">{account?.displayName || account?.email}</p>
              <p className="app-account-roles">
                {(account?.roles || []).map((role) => (
                  <span key={role} className="app-role-pill">
                    {role}
                  </span>
                ))}
              </p>
            </div>
            <button type="button" className="app-logout-button" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <nav className="app-nav" aria-label="Primary navigation">
          <button
            type="button"
            className={`app-nav-item${activeView === "session" ? " app-nav-item-active" : ""}`}
            onClick={() => setActiveView("session")}
          >
            Live Session
          </button>
          {isAdmin ? (
            <button
              type="button"
              className={`app-nav-item${activeView === "admin" ? " app-nav-item-active" : ""}`}
              onClick={() => setActiveView("admin")}
            >
              Admin Tools
            </button>
          ) : null}
        </nav>
        {flashMessage ? (
          <div className="app-flash" role="status" aria-live="assertive">
            <p>{flashMessage}</p>
            <button type="button" onClick={clearFlashMessage}>
              Dismiss
            </button>
          </div>
        ) : null}
        {activeView === "admin" && isAdmin ? (
          <section className="app-admin-panel" aria-label="Admin tools">
            <AdminVerbCatalogPanel />
          </section>
        ) : (
          <div className="app-body">
            <main className="app-main">
              <ChatCanvas />
              <ChatComposer />
            </main>
            <OverlayDock />
          </div>
        )}
        <SessionMarkerRibbon />
      </div>
    </SessionProvider>
  );
}
