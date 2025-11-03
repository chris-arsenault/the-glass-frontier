"use strict";

import { useCallback, useMemo, useState } from "react";
import { useAccountContext } from "../context/AccountContext.jsx";

function formatIso(isoString) {
  if (!isoString) {
    return "Unknown";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
}

function buildCadenceLabel(cadence) {
  if (!cadence) {
    return "Publishing cadence not scheduled.";
  }
  const digest = cadence.nextDigestAt ? `Digest @ ${formatIso(cadence.nextDigestAt)}` : null;
  const batch = cadence.nextBatchAt ? `Batch @ ${formatIso(cadence.nextBatchAt)}` : null;
  const parts = [batch, digest].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Publishing cadence pending.";
}

export function SessionDashboard() {
  const {
    sessions,
    resumeSession,
    approveSession,
    createSession,
    closeSession,
    isAdmin,
    status,
    refreshSessions,
    setActiveView,
    selectedSessionId
  } = useAccountContext() || {};
  const [creating, setCreating] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [closingSessionId, setClosingSessionId] = useState(null);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);

  const sortedSessions = useMemo(() => {
    return Array.isArray(sessions)
      ? sessions.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      : [];
  }, [sessions]);

  const handleCreate = useCallback(
    async (event) => {
      event.preventDefault();
      setCreating(true);
      setFeedback(null);
      try {
        const result = await createSession({
          title: sessionName.trim() || "Frontier Session"
        });
        if (!result?.ok) {
          throw new Error(result?.error || "Failed to create session.");
        }
        setSessionName("");
        setFeedback("Session created. Select resume to continue.");
      } catch (error) {
        setFeedback(error.message);
      } finally {
        setCreating(false);
      }
    },
    [createSession, sessionName]
  );

  const handleResume = useCallback(
    async (sessionId) => {
      const result = await resumeSession(sessionId);
      if (result?.ok) {
        setFeedback("Session ready — switching to live view.");
        if (setActiveView) {
          setActiveView("session");
        }
      } else if (result?.error) {
        setFeedback(result.error);
      }
    },
    [resumeSession, setActiveView]
  );

  const handleApprove = useCallback(
    async (sessionId) => {
      const result = await approveSession(sessionId);
      if (!result?.ok && result?.error) {
        setFeedback(result.error);
      }
    },
    [approveSession]
  );

  const handleRequestClose = useCallback((sessionId) => {
    setClosingSessionId(sessionId);
    setCloseReason("");
    setFeedback(null);
  }, []);

  const handleCancelClose = useCallback(() => {
    setClosingSessionId(null);
    setCloseReason("");
    setClosing(false);
  }, []);

  const handleConfirmClose = useCallback(
    async (sessionId) => {
      if (!sessionId || closing) {
        return;
      }
      setClosing(true);
      try {
        const result = await closeSession(sessionId, {
          reason: closeReason.trim() ? closeReason.trim() : undefined
        });
        if (result?.ok) {
          setFeedback("Session closure queued. Offline reconciliation pending.");
          handleCancelClose();
        } else if (result?.error) {
          setFeedback(result.error);
        }
      } finally {
        setClosing(false);
      }
    },
    [closeReason, closeSession, closing, handleCancelClose]
  );

  return (
    <section className="session-dashboard" aria-labelledby="session-dashboard-heading">
      <header className="session-dashboard-header">
        <div>
          <h1 id="session-dashboard-heading">Session Management</h1>
          <p>
            Select a session to resume play or approve pending publishing cadences. Status updates
            refresh automatically when cadence timelines shift.
          </p>
        </div>
        <button className="session-dashboard-refresh" type="button" onClick={() => refreshSessions()}>
          Refresh
        </button>
      </header>
      <div className="session-dashboard-grid" role="list">
        {sortedSessions.length === 0 ? (
          <p role="status" className="session-dashboard-empty">
            No sessions yet. Create a new run to begin.
          </p>
        ) : (
          sortedSessions.map((session) => {
            const offlineLabel = session.offlinePending ? "Offline changes pending" : "Online";
            const isSelected = selectedSessionId === session.sessionId;
            const canClose =
              session.status !== "closed" && session.status !== "closing" && !session.offlinePending;
            const offlinePipelineLabel = session.offlinePending
              ? "Reconciliation pending"
              : session.offlineLastRun?.status
              ? `Last run ${session.offlineLastRun.status}${
                  session.offlineLastRun.completedAt
                    ? ` @ ${formatIso(session.offlineLastRun.completedAt)}`
                    : ""
                }`
              : "Idle";
            const confirmOpen = closingSessionId === session.sessionId;
            return (
              <article
                key={session.sessionId}
                className="session-card"
                role="listitem"
                data-status={session.status}
                data-selected={isSelected ? "true" : "false"}
              >
                <header className="session-card-header">
                  <div>
                    <h2>{session.title}</h2>
                    <p className="session-card-meta">
                      Last active {formatIso(session.lastActiveAt)} • {offlineLabel}
                    </p>
                  </div>
                  <span className={`session-card-status session-card-status-${session.status}`}>
                    {session.status}
                  </span>
                </header>
                <dl className="session-card-details">
                  <div>
                    <dt>Session ID</dt>
                    <dd>{session.sessionId}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {session.status === "closed"
                        ? `Closed ${formatIso(session.updatedAt)}`
                        : session.status}
                    </dd>
                  </div>
                  <div>
                    <dt>Momentum</dt>
                    <dd>{session.momentum?.current ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Cadence</dt>
                    <dd>{buildCadenceLabel(session.cadence)}</dd>
                  </div>
                  <div>
                    <dt>Offline pipeline</dt>
                    <dd>{offlinePipelineLabel}</dd>
                  </div>
                  {session.requiresApproval ? (
                    <div>
                      <dt>Moderation</dt>
                      <dd>Approval required before publishing.</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="session-card-actions">
                  <button
                    type="button"
                    className="session-card-button"
                    onClick={() => handleResume(session.sessionId)}
                    disabled={status !== "authenticated"}
                    data-testid={`resume-${session.sessionId}`}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    className="session-card-button session-card-button-danger"
                    onClick={() => handleRequestClose(session.sessionId)}
                    disabled={!canClose || status !== "authenticated"}
                    data-testid={`close-${session.sessionId}`}
                  >
                    Close
                  </button>
                  {session.requiresApproval && isAdmin ? (
                    <button
                      type="button"
                      className="session-card-button session-card-button-secondary"
                      onClick={() => handleApprove(session.sessionId)}
                      data-testid={`approve-${session.sessionId}`}
                    >
                      Approve
                    </button>
                  ) : null}
                </div>
                {confirmOpen ? (
                  <div
                    className="session-close-confirm"
                    role="alertdialog"
                    aria-labelledby={`close-confirm-title-${session.sessionId}`}
                    aria-describedby={`close-confirm-desc-${session.sessionId}`}
                    data-testid={`close-confirm-${session.sessionId}`}
                  >
                    <h3 id={`close-confirm-title-${session.sessionId}`}>Confirm session closure</h3>
                    <p id={`close-confirm-desc-${session.sessionId}`}>
                      Closing ends the live run and queues offline consolidation and publishing.
                    </p>
                    <label htmlFor={`close-reason-${session.sessionId}`}>
                      Closure note <span className="session-close-optional">(optional)</span>
                    </label>
                    <input
                      id={`close-reason-${session.sessionId}`}
                      type="text"
                      value={closeReason}
                      onChange={(event) => setCloseReason(event.target.value)}
                      placeholder="Wrap-up reason"
                    />
                    <div className="session-close-actions">
                      <button
                        type="button"
                        className="session-card-button session-card-button-danger"
                        onClick={() => handleConfirmClose(session.sessionId)}
                        disabled={closing}
                      >
                        {closing ? "Closing…" : "Confirm closure"}
                      </button>
                      <button
                        type="button"
                        className="session-card-button session-card-button-secondary"
                        onClick={handleCancelClose}
                        disabled={closing}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      <form className="session-dashboard-create" onSubmit={handleCreate}>
        <div className="form-field">
          <label htmlFor="session-name">New session name</label>
          <input
            id="session-name"
            type="text"
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            placeholder="Frontier Chronicle"
          />
        </div>
        <button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create Session"}
        </button>
      </form>
      <div className="session-dashboard-feedback" role="status" aria-live="polite">
        {feedback}
      </div>
    </section>
  );
}
