import { useState } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";

export function ChatComposer() {
  const { sendPlayerMessage, isSending } = useSessionContext();
  const [draft, setDraft] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return;
    }

    await sendPlayerMessage({ content: trimmed });
    setDraft("");
  };

  return (
    <form
      className="chat-composer"
      onSubmit={handleSubmit}
      aria-label="Send a narrative intent"
      data-testid="chat-composer"
    >
      <label htmlFor="chat-input" className="visually-hidden">
        Describe your intent for the GM
      </label>
      <textarea
        id="chat-input"
        name="chat-input"
        className="chat-input"
        placeholder="Describe your next move…"
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
          disabled={isSending}
          data-testid="chat-submit"
        >
          {isSending ? "Sending…" : "Send to GM"}
        </button>
      </div>
    </form>
  );
}

