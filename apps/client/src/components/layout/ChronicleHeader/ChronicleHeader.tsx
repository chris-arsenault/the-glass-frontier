import React from 'react';

import './ChronicleHeader.css';
import { useChronicleStore } from '../../../stores/chronicleStore';

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  error: 'Connection interrupted',
};

export function ChronicleHeader() {
  const transportError = useChronicleStore((state) => state.transportError);
  const chronicleRecord = useChronicleStore((state) => state.chronicleRecord);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const statusText = STATUS_LABELS[connectionState] ?? 'Idle';
  return (
    <>
      <header className="chat-header">
        <h2 className="chat-title">
          {chronicleRecord?.title?.trim() ? chronicleRecord.title : 'Unknown Chronicle'}
        </h2>
        <div
          className={`chat-status chat-status-${connectionState}`}
          role="status"
          aria-live="polite"
          data-testid="chat-status"
        >
          <span className="chat-status-dot" aria-hidden="true" />
          {statusText}
        </div>
      </header>
      {transportError ? (
        <p className="chat-error" role="alert" data-testid="chat-error">
          {typeof transportError.message === 'string'
            ? transportError.message
            : 'An unexpected connection issue occurred.'}
        </p>
      ) : null}
    </>
  );
}
