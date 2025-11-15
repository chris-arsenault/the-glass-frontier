import type { FormEvent } from 'react';
import React, { useState } from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { LocationOverview } from '../../overview/LocationOverview/LocationOverview';
import './ChatComposer.css';

export function ChatComposer() {
  const sendPlayerMessage = useChronicleStore((state) => state.sendPlayerMessage);
  const isSending = useChronicleStore((state) => state.isSending);
  const isOffline = useChronicleStore((state) => state.isOffline);
  const queuedIntents = useChronicleStore((state) => state.queuedIntents);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const chronicleStatus = useChronicleStore((state) => state.chronicleStatus);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const wrapTargetTurn = useChronicleStore(
    (state) => state.chronicleRecord?.targetEndTurn ?? null
  );
  const setChronicleWrapTarget = useChronicleStore((state) => state.setChronicleWrapTarget);
  const isWrapRequested = typeof wrapTargetTurn === 'number' && !Number.isNaN(wrapTargetTurn);
  const [draft, setDraft] = useState('');
  const [isWrapPending, setIsWrapPending] = useState(false);

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
  const buttonLabel = (() => {
    if (!hasChronicle) {
      return 'Select a chronicle';
    }
    if (chronicleStatus === 'closed' || connectionState === 'closed') {
      return 'Chronicle closed';
    }
    if (isOffline) {
      return queuedCount > 0 ? 'Queue Intent' : 'Queue Intent';
    }
    return isSending ? 'Sending...' : 'Send to GM';
  })();
  const wrapButtonLabel = isWrapRequested ? 'Wrapping' : 'Wrap Up';
  const wrapButtonClassName = `chat-wrap-toggle${isWrapRequested ? ' chat-wrap-toggle--active' : ''}`;

  const handleWrapToggle = async () => {
    if (chronicleUnavailable || isWrapPending) {
      return;
    }
    setIsWrapPending(true);
    try {
      await setChronicleWrapTarget(!isWrapRequested);
    } catch {
      // transportError is handled globally
    } finally {
      setIsWrapPending(false);
    }
  };

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
        <div className="chat-composer-actions">
          {hasChronicle ? (
            <button
              type="button"
              className={wrapButtonClassName}
              aria-pressed={isWrapRequested}
              onClick={handleWrapToggle}
              disabled={chronicleUnavailable || isWrapPending}
            >
              {wrapButtonLabel}
            </button>
          ) : null}
          <button
            type="submit"
            className="chat-send-button"
            disabled={isSending || chronicleUnavailable}
            data-testid="chat-submit"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
