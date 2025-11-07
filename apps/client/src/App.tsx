import { ChatCanvas } from "./components/ChatCanvas.jsx";
import { SessionProvider } from "./context/SessionContext.jsx";

export default function App() {
  const session = {
                  id: "fake",
                role:  "gm",
                content: "weebs",
                turnSequence: 3,
                metadata: {},
                markers: []
  };
  return (
    <SessionProvider value={session}>
      <div className="app-body">
        <main className="app-main">
          <ChatCanvas />
        </main>
      </div>
    </SessionProvider>
  )
}