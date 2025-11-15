import React, { useState } from 'react';

import { trpcClient } from '../../../lib/trpcClient';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './BugReportModal.css';

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

export function BugReportModal(): JSX.Element | null {
  const isOpen = useUiStore((state) => state.isBugReportModalOpen);
  if (!isOpen) {
    return null;
  }
  return <BugReportModalContent />;
}

const createInitialChronicle = (value: string | null): string => (value ?? '').trim();

function BugReportModalContent(): JSX.Element {
  const close = useUiStore((state) => state.closeBugReportModal);
  const loginId = useChronicleStore((state) => state.loginId ?? state.loginName ?? '');
  const chronicleId = useChronicleStore((state) => state.chronicleId ?? null);
  const characterId = useChronicleStore((state) => state.character?.id ?? null);
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [contextChronicleId, setContextChronicleId] = useState(() =>
    createInitialChronicle(chronicleId)
  );
  const [contextCharacterId, setContextCharacterId] = useState(() =>
    createInitialChronicle(characterId)
  );
  const [status, setStatus] = useState<SubmissionState>('idle');
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    summary.trim().length >= 4 && details.trim().length >= 10 && typeof loginId === 'string' && loginId.length > 0;

  const resetForm = () => {
    setSummary('');
    setDetails('');
    setContextChronicleId(createInitialChronicle(chronicleId));
    setContextCharacterId(createInitialChronicle(characterId));
    setStatus('idle');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    close();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || status === 'submitting') {
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      await trpcClient.submitBugReport.mutate({
        characterId: contextCharacterId.trim().length ? contextCharacterId.trim() : null,
        chronicleId: contextChronicleId.trim().length ? contextChronicleId.trim() : null,
        details: details.trim(),
        loginId,
        summary: summary.trim(),
      });
      setStatus('success');
      setSummary('');
      setDetails('');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to submit bug report.');
    }
  };

  return (
    <>
      <div className="modal-backdrop open" onClick={handleClose} aria-hidden="true" />
      <div className="modal open bug-report-modal" role="dialog" aria-modal="true" aria-label="Report a bug">
        <header className="modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">System Issue</p>
            <h2>Report a bug</h2>
          </div>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close bug report form">
            ×
          </button>
        </header>
        <form className="modal-body bug-report-body" onSubmit={handleSubmit}>
          <p className="bug-report-intro">
            This form is for platform bugs that are not tied to a single chronicle turn. Include enough detail so the team
            can reproduce the issue—even if you have to abandon a session.
          </p>
          {loginId ? null : (
            <p className="bug-report-error" role="alert">
              Login context unavailable. Refresh your session before submitting a report.
            </p>
          )}
          <label className="bug-report-label" htmlFor="bug-summary">
            Summary
          </label>
          <input
            id="bug-summary"
            className="bug-report-input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={240}
            required
          />
          <label className="bug-report-label" htmlFor="bug-details">
            Details
          </label>
          <textarea
            id="bug-details"
            className="bug-report-textarea"
            rows={6}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={4000}
            required
          />
          <div className="bug-report-context">
            <div>
              <label className="bug-report-label" htmlFor="bug-chronicle">
                Chronicle ID (optional)
              </label>
              <input
                id="bug-chronicle"
                className="bug-report-input"
                value={contextChronicleId}
                onChange={(event) => setContextChronicleId(event.target.value)}
                placeholder="UUID"
              />
            </div>
            <div>
              <label className="bug-report-label" htmlFor="bug-character">
                Character ID (optional)
              </label>
              <input
                id="bug-character"
                className="bug-report-input"
                value={contextCharacterId}
                onChange={(event) => setContextCharacterId(event.target.value)}
                placeholder="UUID"
              />
            </div>
          </div>
          {error ? (
            <p className="bug-report-error" role="alert">
              {error}
            </p>
          ) : null}
          {status === 'success' ? (
            <p className="bug-report-success">Thanks! Your report has been sent to the Glass Frontier maintainers.</p>
          ) : null}
          <div className="bug-report-actions">
            <button type="button" className="bug-report-cancel" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="bug-report-submit" disabled={!canSubmit || status === 'submitting'}>
              {status === 'submitting' ? 'Sending…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
