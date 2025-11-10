import { useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { SkillCheckBadge } from "./SkillCheckBadge";

const formatStatus = (state: string): string => {
  switch (state) {
    case "connecting":
      return "Connecting to the narrative engine...";
    case "connected":
      return "Connected to the narrative engine.";
    case "error":
      return "Connection interrupted. Please retry.";
    case "closed":
      return "Session has been closed.";
    default:
      return "Idle.";
  }
};

export function ChatCanvas() {
  const messages = useSessionStore((state) => state.messages);
  const connectionState = useSessionStore((state) => state.connectionState);
  const transportError = useSessionStore((state) => state.transportError);
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages]);

  const statusText = formatStatus(connectionState);

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
          messages.map((chatMessage, index) => {
            const {
              entry,
              skillCheckPlan,
              skillCheckResult,
              skillKey,
              attributeKey,
              playerIntent
            } = chatMessage;
            const timestamp =
              typeof entry.metadata?.timestamp === "number"
                ? new Date(entry.metadata.timestamp)
                : new Date();
            const displayRole =
              entry.role === "player" ? "Player" : entry.role === "gm" ? "GM" : "System";

            return (
              <article
                key={entry.id || index}
                className={`chat-entry chat-entry-${entry.role}`}
                data-turn={index}
              >
                <header className="chat-entry-header">
                  <div className="chat-entry-heading">
                    <span className="chat-entry-role" aria-hidden="true">
                      {displayRole}
                    </span>
                    <span className="chat-entry-meta">
                      {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="chat-entry-aside">
                    {entry.role === "player" && playerIntent?.tone ? (
                      <span className="chat-entry-tone">{playerIntent.tone}</span>
                    ) : null}
                    {entry.role === "player" && playerIntent?.creativeSpark ? (
                      <span className="chat-entry-spark" title="Creative Spark awarded">
                        ★
                      </span>
                    ) : null}
                    {entry.role === "gm" ? (
                      <SkillCheckBadge
                        plan={skillCheckPlan}
                        result={skillCheckResult}
                        skillKey={skillKey}
                        attributeKey={attributeKey}
                      />
                    ) : null}
                  </div>
                </header>
                <p
                  className="chat-entry-content"
                  title={
                    entry.role === "player" ? playerIntent?.intentSummary ?? undefined : undefined
                  }
                >
                  {entry.content}
                </p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
