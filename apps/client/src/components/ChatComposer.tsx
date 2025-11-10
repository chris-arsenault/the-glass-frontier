import type { FormEvent } from "react";
import { useState } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function ChatComposer() {
  const sendPlayerMessage = useSessionStore((state) => state.sendPlayerMessage);
  const isSending = useSessionStore((state) => state.isSending);
  const isOffline = useSessionStore((state) => state.isOffline);
  const queuedIntents = useSessionStore((state) => state.queuedIntents);
  const connectionState = useSessionStore((state) => state.connectionState);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const [draft, setDraft] = useState("");

  const sessionIsClosed = sessionStatus === "closed" || connectionState === "closed";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || sessionIsClosed) {
      return;
    }

    setDraft("");
    try {
      await sendPlayerMessage({ content: trimmed });
    } catch {
      setDraft(trimmed);
    }
  };

  const queuedCount = Math.max(queuedIntents, 0);
  const buttonLabel = sessionIsClosed
    ? "Session closed"
    : isOffline
    ? queuedCount > 0
      ? "Queue Intent"
      : "Queue Intent"
    : isSending
    ? "Sending..."
    : "Send to GM";

  return (
    <form
      className="chat-composer"
      onSubmit={handleSubmit}
      aria-label="Send a narrative intent"
      data-testid="chat-composer"
    >
      {isOffline ? (
        <p
          className="chat-offline-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-offline-banner"
        >
          Connection degraded — intents will queue and send once online.
          {queuedCount > 0 ? ` ${queuedCount} pending.` : ""}
        </p>
      ) : sessionIsClosed ? (
        <p
          className="chat-closed-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-closed-banner"
        >
          Session closed. Offline reconciliation in progress. Messaging disabled.
        </p>
      ) : null}
      <label htmlFor="chat-input" className="visually-hidden">
        Describe your intent for the GM
      </label>
      <textarea
        id="chat-input"
        name="chat-input"
        className="chat-input"
        placeholder="Describe your next move..."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        required
        aria-required="true"
        data-testid="chat-input"
      />
      <div className="chat-composer-controls">
        <button
          type="submit"
          className="chat-send-button"
          disabled={isSending || sessionIsClosed}
          data-testid="chat-submit"
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
