import type { FormEvent } from 'react';
import { useState } from 'react';

import { useChronicleStore } from '../stores/chronicleStore';
import { LocationOverview } from './LocationOverview';

export function ChatComposer() {
  const sendPlayerMessage = useChronicleStore((state) => state.sendPlayerMessage);
  const isSending = useChronicleStore((state) => state.isSending);
  const isOffline = useChronicleStore((state) => state.isOffline);
  const queuedIntents = useChronicleStore((state) => state.queuedIntents);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const chronicleStatus = useChronicleStore((state) => state.chronicleStatus);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const [draft, setDraft] = useState('');

  const chronicleUnavailable =
    !hasChronicle || chronicleStatus === 'closed' || connectionState === 'closed';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || chronicleUnavailable) {
      return;
    }

    setDraft('');
    try {
      await sendPlayerMessage({ content: trimmed });
    } catch {
      setDraft(trimmed);
    }
  };

  const queuedCount = Math.max(queuedIntents, 0);
  const buttonLabel = !hasChronicle
    ? 'Select a chronicle'
    : chronicleStatus === 'closed' || connectionState === 'closed'
      ? 'Chronicle closed'
      : isOffline
        ? queuedCount > 0
          ? 'Queue Intent'
          : 'Queue Intent'
        : isSending
          ? 'Sending...'
          : 'Send to GM';

  return (
    <form
      className="chat-composer"
      onSubmit={handleSubmit}
      aria-label="Send a narrative intent"
      data-testid="chat-composer"
    >
      {!hasChronicle ? (
        <p
          className="chat-closed-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-closed-banner"
        >
          Select or create a chronicle to send new intents.
        </p>
      ) : isOffline ? (
        <p
          className="chat-offline-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-offline-banner"
        >
          Connection degraded — intents will queue and send once online.
          {queuedCount > 0 ? ` ${queuedCount} pending.` : ''}
        </p>
      ) : chronicleUnavailable ? (
        <p
          className="chat-closed-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-closed-banner"
        >
          Chronicle closed. Offline reconciliation in progress. Messaging disabled.
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
        disabled={chronicleUnavailable}
      />
      <div className="chat-composer-controls">
        {hasChronicle ? <LocationOverview /> : null}
        <button
          type="submit"
          className="chat-send-button"
          disabled={isSending || chronicleUnavailable}
          data-testid="chat-submit"
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
