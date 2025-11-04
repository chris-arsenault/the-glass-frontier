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

export function ModerationCadenceStrip({ sessions = [], loading = false, error = null, onRefresh, onSelectSession }) {
  const [now, setNow] = useState(new Date());

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
        return {
          sessionId: entry.sessionId,
          playerName: entry.player?.name || entry.player?.displayName || entry.sessionId,
          queue,
          blockingItems,
          totalAlerts: entry.stats?.totalAlerts ?? 0,
          deadline,
          reasons: collectReasons(blockingItems),
          nextBatchAt: queue.cadence?.nextBatchAt || null,
          nextDigestAt: queue.cadence?.nextDigestAt || null
        };
      })
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
            const countdownLabel = formatCountdown(entry.deadline, now);
            const nextBatchLabel = entry.nextBatchAt ? formatIso(entry.nextBatchAt) : "Not scheduled";
            const nextDigestLabel = entry.nextDigestAt ? formatIso(entry.nextDigestAt) : "Not scheduled";
            const hasBlocking = entry.blockingItems.length > 0;
            return (
              <li
                key={entry.sessionId}
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
                    <dd>{entry.reasons.length > 0 ? entry.reasons.join(", ") : "Awaiting review"}</dd>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
