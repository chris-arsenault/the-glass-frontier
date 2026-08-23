import type { FormEvent } from 'react';
import React, { useState } from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { LocationOverview } from '../../overview/LocationOverview/LocationOverview';
import './ChatComposer.css';

export function ChatComposer() {
  const sendPlayerMessage = useChronicleStore((state) => state.sendPlayerMessage);
  const isSending = useChronicleStore((state) => state.isSending);
  const entityRoster = useChronicleStore((state) => state.chronicleRecord?.entityRoster.entries ?? []);
  const selectedEntityIds = useChronicleStore((state) => state.selectedEntityIds);
  const toggleEntityTarget = useChronicleStore((state) => state.toggleEntityTarget);
  const chronicleStatus = useChronicleStore((state) => state.chronicleStatus);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const wrapTargetTurn = useChronicleStore(
    (state) => state.chronicleRecord?.targetEndTurn ?? null
  );
  const setChronicleWrapTarget = useChronicleStore((state) => state.setChronicleWrapTarget);
  const isWrapRequested = typeof wrapTargetTurn === 'number' && !Number.isNaN(wrapTargetTurn);
  const [draft, setDraft] = useState('');
  const [isWrapPending, setIsWrapPending] = useState(false);

  const chronicleUnavailable = !hasChronicle || chronicleStatus === 'closed';

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

  const buttonLabel = (() => {
    if (!hasChronicle) {
      return 'Select a chronicle';
    }
    if (chronicleStatus === 'closed') {
      return 'Chronicle closed';
    }
    return isSending ? 'Sending...' : 'Send to GM';
  })();
  const wrapButtonLabel = isWrapRequested ? 'Wrapping' : 'Wrap Up';
  const wrapButtonClassName = `chat-wrap-toggle${isWrapRequested ? ' chat-wrap-toggle-active' : ''}`;

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
      ) : chronicleUnavailable ? (
        <p
          className="chat-closed-banner"
          role="status"
          aria-live="assertive"
          data-testid="chat-closed-banner"
        >
          This chronicle has ended. Its story is complete.
        </p>
      ) : null}
      {selectedEntityIds.length > 0 ? (
        <div className="chat-entity-targets" aria-label="Entities attached to this move">
          <span>Interacting with</span>
          {selectedEntityIds.map((entityId) => {
            const entity = entityRoster.find((entry) => entry.id === entityId);
            return entity === undefined ? null : (
              <button
                type="button"
                key={entity.id}
                onClick={() => toggleEntityTarget(entity.id)}
                disabled={isSending}
                aria-label={`Remove ${entity.name}`}
              >
                {entity.name} ×
              </button>
            );
          })}
        </div>
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
