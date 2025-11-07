import { useEffect, useMemo, useState } from "react";

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(value) {
  const date = toDate(value);
  if (!date) {
    return "Unknown";
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatCountdown(deadline, now) {
  if (!deadline) {
    return "Awaiting window";
  }
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) {
    return "Window elapsed";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function collectReasons(items) {
  const reasonSet = new Set();
  items.forEach((item) => {
    if (Array.isArray(item.reasons)) {
      item.reasons.forEach((reason) => {
        if (reason) {
          reasonSet.add(reason);
        }
      });
    }
  });
  return Array.from(reasonSet).sort();
}

function formatReasonCounts(reasonCounts, fallbackReasons) {
  if (Array.isArray(reasonCounts) && reasonCounts.length > 0) {
    return reasonCounts
      .map((entry) => `${entry.reason} (${entry.count})`)
      .join(", ");
  }
  if (Array.isArray(fallbackReasons) && fallbackReasons.length > 0) {
    return fallbackReasons.join(", ");
  }
  return "Awaiting review";
}

function formatEntityType(entityType) {
  if (!entityType) {
    return "Entity";
  }
  return String(entityType)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ModerationCadenceStrip({
  sessions = [],
  loading = false,
  error = null,
  onRefresh,
  onSelectSession,
  onApplyOverride
}) {
  const [now, setNow] = useState(new Date());
  const [overrideMinutes, setOverrideMinutes] = useState({});
  const [overrideReasons, setOverrideReasons] = useState({});
  const [overrideErrors, setOverrideErrors] = useState({});
  const [overrideSubmitting, setOverrideSubmitting] = useState({});

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const orderedSessions = useMemo(() => {
    return sessions
      .map((entry) => {
        const queue = entry.queue || {};
        const items = Array.isArray(queue.items) ? queue.items : [];
        const blockingItems = items.filter((item) => item.blocking !== false);
        const deadlineIso = queue.window?.endAt || blockingItems[0]?.deadlineAt || null;
        const deadline = toDate(deadlineIso);
        const aggregates = entry.aggregates || {};
        const blockingGroups = Array.isArray(aggregates.blockingGroups) ? aggregates.blockingGroups : [];
        const reasonCounts = Array.isArray(aggregates.reasonCounts) ? aggregates.reasonCounts : [];
        return {
          sessionId: entry.sessionId,
          playerName: entry.player?.name || entry.player?.displayName || entry.sessionId,
          queue,
          blockingItems,
          totalAlerts: entry.stats?.totalAlerts ?? 0,
          deadline,
          reasonSummary: formatReasonCounts(reasonCounts, collectReasons(blockingItems)),
          nextBatchAt: queue.cadence?.nextBatchAt || null,
          nextDigestAt: queue.cadence?.nextDigestAt || null,
          aggregates: {
            blockingGroups,
            capabilityCounts: Array.isArray(aggregates.capabilityCounts)
              ? aggregates.capabilityCounts
              : []
          }
        };
      })
      .filter((entry) => entry.blockingItems.length > 0)
      .sort((a, b) => {
        const aPending = a.blockingItems.length;
        const bPending = b.blockingItems.length;
        if (aPending !== bPending) {
          return bPending - aPending;
        }
        const aDeadline = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
        const bDeadline = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
        return aDeadline - bDeadline;
      });
  }, [sessions]);

  function updateOverrideError(sessionId, message) {
    setOverrideErrors((prev) => {
      const next = { ...prev };
      if (!message) {
        delete next[sessionId];
      } else {
        next[sessionId] = message;
      }
      return next;
    });
  }

  function clearOverrideInputs(sessionId) {
    setOverrideMinutes((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setOverrideReasons((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }

  return (
    <section
      className="moderation-cadence"
      data-testid="moderation-cadence"
      aria-live="polite"
      aria-busy={loading}
    >
      <header className="moderation-cadence__header">
        <h2>Publishing Moderation Cadence</h2>
        <div className="moderation-cadence__actions">
          {onRefresh ? (
            <button
              type="button"
              className="moderation-refresh-button"
              onClick={onRefresh}
              disabled={loading}
              data-testid="moderation-cadence-refresh"
            >
              Refresh
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <p className="moderation-cadence__error" role="alert">
          {error}
        </p>
      ) : null}
      {orderedSessions.length === 0 ? (
        <p className="moderation-cadence__empty">No sessions pending moderation.</p>
      ) : (
        <ul className="moderation-cadence__list">
          {orderedSessions.map((entry) => {
            const sessionId = entry.sessionId;
            const countdownLabel = formatCountdown(entry.deadline, now);
            const nextBatchLabel = entry.nextBatchAt ? formatIso(entry.nextBatchAt) : "Not scheduled";
            const nextDigestLabel = entry.nextDigestAt ? formatIso(entry.nextDigestAt) : "Not scheduled";
            const hasBlocking = entry.blockingItems.length > 0;
            const minutesValue = overrideMinutes[sessionId] ?? "60";
            const reasonValue = overrideReasons[sessionId] ?? "";
            const submitting = Boolean(overrideSubmitting[sessionId]);
            const localError = overrideErrors[sessionId] || null;

            const handleSubmitOverride = async () => {
              if (!onApplyOverride) {
                return;
              }

              const parsedMinutes = Number(minutesValue);
              if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
                updateOverrideError(sessionId, "Enter minutes greater than zero.");
                return;
              }

              updateOverrideError(sessionId, null);
              setOverrideSubmitting((prev) => ({ ...prev, [sessionId]: true }));

              try {
                const result = await onApplyOverride(sessionId, {
                  deferByMinutes: parsedMinutes,
                  reason: reasonValue.trim() ? reasonValue.trim() : undefined
                });
                if (result === false) {
                  updateOverrideError(sessionId, "Override could not be applied.");
                } else {
                  clearOverrideInputs(sessionId);
                  updateOverrideError(sessionId, null);
                }
              } catch (applyError) {
                const rawMessage = applyError?.message;
                const friendlyMessage =
                  !rawMessage || rawMessage.startsWith("publishing_")
                    ? "Failed to apply cadence override."
                    : rawMessage;
                updateOverrideError(sessionId, friendlyMessage);
              } finally {
                setOverrideSubmitting((prev) => {
                  const next = { ...prev };
                  delete next[sessionId];
                  return next;
                });
              }
            };

            return (
              <li
                key={sessionId}
                className={`moderation-cadence__item${hasBlocking ? " moderation-cadence__item--blocking" : ""}`}
                data-testid="moderation-cadence-item"
              >
                <div className="moderation-cadence__item-header">
                  <h3>
                    {entry.playerName}
                    <small> ({entry.sessionId})</small>
                  </h3>
                  <p className="moderation-cadence__countdown" data-testid="moderation-cadence-countdown">
                    SLA Countdown: <strong>{countdownLabel}</strong>
                  </p>
                </div>
                <dl className="moderation-cadence__meta">
                  <div>
                    <dt>Pending Deltas</dt>
                    <dd data-testid="moderation-cadence-pending">{entry.blockingItems.length}</dd>
                  </div>
                  <div>
                    <dt>Reasons</dt>
                    <dd>{entry.reasonSummary}</dd>
                  </div>
                  <div>
                    <dt>Next Batch</dt>
                    <dd>{nextBatchLabel}</dd>
                  </div>
                  <div>
                    <dt>Digest Run</dt>
                    <dd>{nextDigestLabel}</dd>
                  </div>
                </dl>
                <div className="moderation-cadence__footer">
                  <span className="moderation-cadence__status">
                    {hasBlocking
                      ? "Publishing blocked until moderation completes."
                      : "Moderation window clear."}
                  </span>
                  {hasBlocking && onSelectSession ? (
                    <button
                      type="button"
                      className="moderation-cadence__action-button"
                      data-testid="moderation-cadence-open-session"
                      onClick={() => onSelectSession(entry.sessionId)}
                    >
                      Review Alerts
                    </button>
                  ) : null}
                </div>
                {hasBlocking && onApplyOverride ? (
                  <div className="moderation-cadence__override" data-testid="moderation-cadence-override">
                    <label htmlFor={`cadence-override-minutes-${sessionId}`}>
                      Defer batch (minutes)
                      <input
                        id={`cadence-override-minutes-${sessionId}`}
                        type="number"
                        min="1"
                        max="720"
                        value={minutesValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          setOverrideMinutes((prev) => ({
                            ...prev,
                            [sessionId]: value
                          }));
                          updateOverrideError(sessionId, null);
                        }}
                        data-testid="moderation-cadence-override-minutes"
                      />
                    </label>
                    <label htmlFor={`cadence-override-reason-${sessionId}`}>
                      Reason (optional)
                      <input
                        id={`cadence-override-reason-${sessionId}`}
                        type="text"
                        value={reasonValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          setOverrideReasons((prev) => ({
                            ...prev,
                            [sessionId]: value
                          }));
                          updateOverrideError(sessionId, null);
                        }}
                        placeholder="e.g. awaiting admin rewrite"
                        data-testid="moderation-cadence-override-reason"
                      />
                    </label>
                    <button
                      type="button"
                      className="moderation-cadence__override-button"
                      onClick={handleSubmitOverride}
                      disabled={loading || submitting}
                      data-testid="moderation-cadence-override-submit"
                    >
                      {submitting ? "Applying…" : "Apply Override"}
                    </button>
                    {localError ? (
                      <p className="moderation-cadence__override-error" role="alert">
                        {localError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {entry.aggregates.blockingGroups.length > 0 ? (
                  <ul
                    className="moderation-cadence__clusters"
                    aria-label="Blocking delta groups"
                    data-testid="moderation-cadence-clusters"
                  >
                    {entry.aggregates.blockingGroups.map((group) => (
                      <li
                        key={group.key}
                        className="moderation-cadence__cluster"
                        data-testid="moderation-cadence-cluster"
                      >
                        <div className="moderation-cadence__cluster-header">
                          <strong>{group.count}×</strong> {formatEntityType(group.entityType)}
                          {group.canonicalName ? <span> • {group.canonicalName}</span> : null}
                        </div>
                        {group.reasons.length > 0 ? (
                          <div className="moderation-cadence__cluster-meta">
                            Reasons: {group.reasons.join(", ")}
                          </div>
                        ) : null}
                        {group.capabilityViolations.length > 0 ? (
                          <div className="moderation-cadence__cluster-meta">
                            Capability flags: {group.capabilityViolations.join(", ")}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
