import { SessionProvider } from "./context/SessionContext.jsx";
import { useSessionConnection } from "./hooks/useSessionConnection.js";
import { ChatCanvas } from "./components/ChatCanvas.jsx";
import { ChatComposer } from "./components/ChatComposer.jsx";
import { SessionMarkerRibbon } from "./components/SessionMarkerRibbon.jsx";
import { OverlayDock } from "./components/OverlayDock.jsx";

export default function App() {
  const session = useSessionConnection();

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
        </header>
        <div className="app-body">
          <main className="app-main">
            <ChatCanvas />
            <ChatComposer />
          </main>
          <OverlayDock />
        </div>
        <SessionMarkerRibbon />
      </div>
    </SessionProvider>
  );
}

