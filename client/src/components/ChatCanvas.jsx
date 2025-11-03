import { useEffect, useRef } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";
import { SessionConnectionStates } from "../hooks/useSessionConnection.js";

function describeConnection(state) {
  switch (state) {
    case SessionConnectionStates.CONNECTING:
      return "Connecting to session…";
    case SessionConnectionStates.READY:
      return "Live session connection established.";
    case SessionConnectionStates.FALLBACK:
      return "Live updates using fallback channel.";
    case SessionConnectionStates.ERROR:
      return "Connection issues detected.";
    case SessionConnectionStates.CLOSED:
      return "Session connection closed.";
    default:
      return "";
  }
}

export function ChatCanvas() {
  const { messages, connectionState, transportError } = useSessionContext();
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages]);

  const statusText = describeConnection(connectionState);

  return (
    <section
      className="chat-canvas"
      aria-label="Narrative transcript"
      data-testid="chat-canvas"
    >
      <div className="chat-status" role="status" aria-live="polite" data-testid="chat-status">
        {statusText}
      </div>
      {transportError ? (
        <p className="chat-error" role="alert" data-testid="chat-error">
          {typeof transportError.message === "string"
            ? transportError.message
            : "An unexpected connection issue occurred."}
        </p>
      ) : null}
      <div
        ref={streamRef}
        className="chat-stream"
        role="log"
        aria-live="polite"
        tabIndex={0}
        data-testid="chat-log"
      >
        {messages.length === 0 ? (
          <p className="chat-empty" data-testid="chat-empty">
            Awaiting the first story beat. Share an intent to begin.
          </p>
        ) : (
          messages.map((message, index) => (
            <article
              key={message.id || index}
              className={`chat-entry chat-entry-${message.role}`}
              data-turn={message.turnSequence ?? index}
            >
              <header className="chat-entry-header">
                <span className="chat-entry-role" aria-hidden="true">
                  {message.role === "player" ? "Player" : "GM"}
                </span>
                <span className="chat-entry-meta">
                  {new Date(message.metadata.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </header>
              <p className="chat-entry-content">{message.content}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

