import { ChatCanvas } from "./components/ChatCanvas";
import { ChatComposer } from "./components/ChatComposer";
import { useSessionStore } from "./stores/sessionStore";
import { useSessionNarrationConnection } from "./hooks/useSessionNarrationConnection";

export default function App() {
  const sessionId = useSessionStore((state) => state.sessionId);
  useSessionNarrationConnection();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">The Glass Frontier</h1>
        {sessionId ? <p className="app-session-id">Session {sessionId}</p> : null}
      </header>
      <div className="app-body">
        <main className="app-main">
          <ChatCanvas />
          <ChatComposer />
        </main>
      </div>
    </div>
  );
}
