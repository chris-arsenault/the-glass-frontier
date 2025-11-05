import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountContext } from "../context/AccountContext.jsx";
import { ModerationCadenceStrip } from "./ModerationCadenceStrip.jsx";

const STATUS_ORDER = ["live", "queued", "escalated", "resolved"];
const STATUS_LABELS = {
  live: "Live Alerts",
  queued: "Queued",
  escalated: "Escalated",
  resolved: "Resolved"
};

function formatTimestamp(value) {
  if (!value) {
    return "Unknown";
  }
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch (_error) {
    return String(value);
  }
}

function formatDurationMs(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }
  if (value >= 60000) {
    const minutes = Math.round(value / 60000);
    return `${minutes} min`;
  }
  const seconds = Math.round(value / 1000);
  return `${seconds} s`;
}

function groupAlertsByStatus(alerts) {
  const groups = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {});

  alerts.forEach((alert) => {
    const status = STATUS_ORDER.includes(alert.status) ? alert.status : "live";
    groups[status].push(alert);
  });

  STATUS_ORDER.forEach((status) => {
    groups[status].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
  });

  return groups;
}

export function ModerationDashboard() {
  const { fetchWithAuth, setFlashMessage, isAdmin } = useAccountContext();
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ total: 0, live: 0, queued: 0, escalated: 0, resolved: 0 });
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [alertDetail, setAlertDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [overrideOutcome, setOverrideOutcome] = useState("");
  const [contestArtefacts, setContestArtefacts] = useState([]);
  const [latestContestSummary, setLatestContestSummary] = useState(null);
  const [cadenceSessions, setCadenceSessions] = useState([]);
  const [cadenceLoading, setCadenceLoading] = useState(false);
  const [cadenceError, setCadenceError] = useState(null);
  const [sentimentOverview, setSentimentOverview] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState(null);

  const grouped = useMemo(() => groupAlertsByStatus(alerts), [alerts]);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth("/admin/moderation/alerts", { method: "GET" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to load moderation alerts (${response.status})`);
      }
      const payload = await response.json();
      const list = Array.isArray(payload.alerts) ? payload.alerts : [];
      setAlerts(list);
      setStats({
        total: payload.stats?.total ?? list.length,
        live: payload.stats?.live ?? list.filter((alert) => alert.status === "live").length,
        queued: payload.stats?.queued ?? list.filter((alert) => alert.status === "queued").length,
        escalated:
          payload.stats?.escalated ?? list.filter((alert) => alert.status === "escalated").length,
        resolved:
          payload.stats?.resolved ?? list.filter((alert) => alert.status === "resolved").length
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  const loadCadence = useCallback(async () => {
    setCadenceLoading(true);
    setCadenceError(null);
    try {
      const response = await fetchWithAuth("/admin/moderation/cadence", { method: "GET" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to load moderation cadence (${response.status})`);
      }
      const payload = await response.json();
      const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      setCadenceSessions(sessions);
    } catch (cadenceLoadError) {
      setCadenceError(cadenceLoadError.message);
    } finally {
      setCadenceLoading(false);
    }
  }, [fetchWithAuth]);

  const loadAlertDetail = useCallback(
    async (alertId) => {
      if (!alertId) {
        setAlertDetail(null);
        return;
      }
      setDetailLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuth(`/admin/moderation/alerts/${encodeURIComponent(alertId)}`, {
          method: "GET"
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to load alert ${alertId}`);
        }
        const payload = await response.json();
        setAlertDetail(payload);
        if (payload.alert?.status === "resolved") {
          setDecisionNotes("");
          setOverrideOutcome("");
        }
      } catch (detailError) {
        setError(detailError.message);
      } finally {
        setDetailLoading(false);
      }
    },
    [fetchWithAuth]
  );

  const loadContestArtefacts = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/admin/moderation/contest/artefacts", { method: "GET" });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const entries = Array.isArray(payload.artefacts) ? payload.artefacts : [];
      setContestArtefacts(entries);
      if (entries.length > 0) {
        const summaryResponse = await fetchWithAuth(
          `/admin/moderation/contest/summary?file=${encodeURIComponent(entries[0].path)}`,
          { method: "GET" }
        );
        if (summaryResponse.ok) {
          const summary = await summaryResponse.json();
          setLatestContestSummary(summary);
        }
      }
    } catch (_error) {
      // Ignore artefact errors for now.
    }
  }, [fetchWithAuth]);

  const loadContestSentiment = useCallback(async () => {
    setSentimentLoading(true);
    setSentimentError(null);
    try {
      const response = await fetchWithAuth("/admin/moderation/contest/sentiment?limit=10", {
        method: "GET"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to load contest sentiment (${response.status})`);
      }
      const payload = await response.json();
      setSentimentOverview(payload);
    } catch (sentimentLoadError) {
      setSentimentError(sentimentLoadError.message);
    } finally {
      setSentimentLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    loadAlerts();
    loadCadence();
    loadContestArtefacts();
    loadContestSentiment();
  }, [loadAlerts, loadCadence, loadContestArtefacts, loadContestSentiment]);

  useEffect(() => {
    if (typeof window === "undefined" || !isAdmin) {
      return undefined;
    }

    const channelId = "admin:moderation";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(channelId)}`;

    let ws;
    let eventSource;
    let reconnectTimer;
    let closed = false;

    const scheduleReconnect = (callback, delay = 200) => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(callback, delay);
    };

    const handleEnvelope = (data) => {
      if (!data || data.type !== "admin.moderation.cadence") {
        return;
      }
      const sessions = Array.isArray(data.payload?.sessions) ? data.payload.sessions : [];
      setCadenceSessions(sessions);
      setCadenceError(null);
    };

    const connectEventSource = () => {
      if (closed) {
        return;
      }
      if (typeof window.EventSource !== "function") {
        scheduleReconnect(connectWebSocket, 2000);
        return;
      }
      eventSource = new EventSource(`/sessions/${encodeURIComponent(channelId)}/events`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEnvelope(data);
        } catch (streamError) {
          setCadenceError(streamError.message);
        }
      };
      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!closed) {
          scheduleReconnect(connectWebSocket, 2000);
        }
      };
    };

    const connectWebSocket = () => {
      if (closed) {
        return;
      }

      try {
        ws = new WebSocket(wsUrl);
      } catch (creationError) {
        setCadenceError(creationError.message);
        scheduleReconnect(connectEventSource, 2000);
        return;
      }

      ws.onopen = () => {
        setCadenceError(null);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEnvelope(data);
        } catch (parseError) {
          setCadenceError(parseError.message);
        }
      };
      ws.onerror = () => {
        if (!closed) {
          scheduleReconnect(connectEventSource, 200);
        }
        try {
          ws.close();
        } catch (_error) {
          // ignore close errors
        }
      };
      ws.onclose = () => {
        if (!closed) {
          scheduleReconnect(connectEventSource, 200);
        }
      };
    };

    connectWebSocket();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (ws) {
        try {
          ws.close();
        } catch (_error) {
          // ignore close errors
        }
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isAdmin]);

  useEffect(() => {
    if (selectedAlertId) {
      loadAlertDetail(selectedAlertId);
    }
  }, [selectedAlertId, loadAlertDetail]);

  const handleSelectCadenceSession = useCallback(
    (sessionId) => {
      if (!sessionId) {
        return;
      }
      const match =
        alerts.find((alert) => alert.sessionId === sessionId && alert.status !== "resolved") ||
        alerts.find((alert) => alert.sessionId === sessionId);
      if (match) {
        setSelectedAlertId(match.id);
        loadAlertDetail(match.id);
      }
    },
    [alerts, loadAlertDetail]
  );

  const applyDecision = useCallback(
    async (action) => {
      if (!selectedAlertId) {
        return;
      }
      setDetailLoading(true);
      setError(null);
      try {
        const payload = {
          action,
          notes: decisionNotes || undefined
        };
        if (action === "amend" && overrideOutcome) {
          payload.override = {
            narrative: overrideOutcome
          };
        }
        if (action === "escalate") {
          payload.escalation = {
            reason: decisionNotes || "escalated_for_review"
          };
        }
        const response = await fetchWithAuth(
          `/admin/moderation/alerts/${encodeURIComponent(selectedAlertId)}/decision`,
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Failed to apply decision (${response.status})`);
        }
        const result = await response.json();
        setAlertDetail(result);
        setDecisionNotes("");
        setOverrideOutcome("");
        setFlashMessage?.("Moderation decision recorded.");
        await loadAlerts();
        await loadAlertDetail(selectedAlertId);
        await loadCadence();
      } catch (decisionError) {
        setError(decisionError.message);
      } finally {
        setDetailLoading(false);
      }
    },
    [decisionNotes, fetchWithAuth, loadAlertDetail, loadAlerts, loadCadence, overrideOutcome, selectedAlertId, setFlashMessage]
  );

  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) {
      return null;
    }
    return alerts.find((alert) => alert.id === selectedAlertId) || null;
  }, [alerts, selectedAlertId]);

  const handleRefresh = useCallback(() => {
    loadAlerts();
    loadCadence();
    loadContestSentiment();
    loadContestArtefacts();
  }, [loadAlerts, loadCadence, loadContestSentiment, loadContestArtefacts]);

  const applyCadenceOverride = useCallback(
    async (sessionId, options = {}) => {
      if (!sessionId) {
        return false;
      }

      setCadenceError(null);
      try {
        const payload = {};
        if (options.deferUntil) {
          payload.deferUntil = options.deferUntil;
        } else if (Number.isFinite(options.deferByMinutes)) {
          payload.deferByMinutes = options.deferByMinutes;
        } else {
          throw new Error("Override requires a defer time.");
        }
        if (options.reason) {
          payload.reason = options.reason;
        }
        if (Number.isInteger(options.batchIndex)) {
          payload.batchIndex = options.batchIndex;
        }

        const response = await fetchWithAuth(
          `/admin/moderation/cadence/${encodeURIComponent(sessionId)}/override`,
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Failed to apply override (${response.status})`);
        }

        await response.json().catch(() => ({}));
        await loadCadence();
        setFlashMessage?.("Publishing cadence override applied.");
        return true;
      } catch (overrideError) {
        setCadenceError(overrideError.message);
        return false;
      }
    },
    [fetchWithAuth, loadCadence, setFlashMessage]
  );

  return (
    <div className="moderation-dashboard" data-testid="moderation-dashboard">
      <header className="moderation-dashboard-header">
        <div>
          <h2>Moderation Dashboard</h2>
          <p>Live override queue, contest telemetry snapshots, and decision audit trail.</p>
        </div>
        <div className="moderation-dashboard-stats">
          <span title="Live alerts" data-testid="moderation-count-live">
            Live: {stats.live}
          </span>
          <span title="Queued for follow-up" data-testid="moderation-count-queued">
            Queued: {stats.queued}
          </span>
          <span title="Escalated to admins" data-testid="moderation-count-escalated">
            Escalated: {stats.escalated}
          </span>
          <span title="Resolved alerts" data-testid="moderation-count-resolved">
            Resolved: {stats.resolved}
          </span>
        </div>
        <button type="button" onClick={handleRefresh} className="moderation-refresh-button">
          Refresh
        </button>
      </header>
      {error ? (
        <div className="moderation-error" role="alert">
          {error}
        </div>
      ) : null}
      <ModerationCadenceStrip
        sessions={cadenceSessions}
        loading={cadenceLoading}
        error={cadenceError}
        onRefresh={loadCadence}
        onSelectSession={handleSelectCadenceSession}
        onApplyOverride={applyCadenceOverride}
      />
      <div className="moderation-layout">
        <section className="moderation-columns" aria-label="Moderation alert columns">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className={`moderation-column moderation-column-${status}`}
              data-testid={`moderation-column-${status}`}
            >
              <h3>{STATUS_LABELS[status]}</h3>
              {loading && alerts.length === 0 ? (
                <p className="moderation-empty">Loading…</p>
              ) : grouped[status]?.length > 0 ? (
                <ul>
                  {grouped[status].map((alert) => (
                    <li key={alert.id}>
                      <button
                        type="button"
                        className={`moderation-alert-button${
                          alert.id === selectedAlertId ? " moderation-alert-button-active" : ""
                        }`}
                        onClick={() => setSelectedAlertId(alert.id)}
                        data-testid={`moderation-alert-${alert.id}`}
                      >
                        <span className="moderation-alert-reason">{alert.reason}</span>
                        <span className={`moderation-alert-severity severity-${alert.severity || "info"}`}>
                          {alert.severity}
                        </span>
                        <span className="moderation-alert-timestamp">
                          {formatTimestamp(alert.updatedAt || alert.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="moderation-empty">No alerts</p>
              )}
            </div>
          ))}
        </section>
        <section className="moderation-detail" aria-label="Moderation detail and overrides">
          {selectedAlert && alertDetail ? (
            <div>
              <header className="moderation-detail-header">
                <h3>{selectedAlert.reason}</h3>
                <span className={`moderation-alert-severity severity-${selectedAlert.severity || "info"}`}>
                  {selectedAlert.severity}
                </span>
                <span className="moderation-detail-status" data-testid="moderation-detail-status">
                  Status: {selectedAlert.status}
                </span>
              </header>
              <p className="moderation-detail-meta">
                Session <strong>{selectedAlert.sessionId}</strong> • Created{" "}
                {formatTimestamp(selectedAlert.createdAt)}
              </p>
              <div className="moderation-detail-sections">
                <div className="moderation-detail-card">
                  <h4>Alert payload</h4>
                  <pre>{JSON.stringify(selectedAlert.data || {}, null, 2)}</pre>
                </div>
                {alertDetail.session ? (
                  <div className="moderation-detail-card">
                    <h4>Transcript preview</h4>
                    {alertDetail.session.transcript?.length > 0 ? (
                      <ul className="moderation-transcript">
                        {alertDetail.session.transcript.map((entry) => (
                          <li key={entry.id}>
                            <span className="moderation-transcript-role">{entry.role}</span>
                            <span className="moderation-transcript-text">{entry.text}</span>
                            <span className="moderation-transcript-time">
                              {formatTimestamp(entry.timestamp)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="moderation-empty">No transcript entries captured yet.</p>
                    )}
                  </div>
                ) : null}
                {alertDetail.moderation?.decisions?.length ? (
                  <div className="moderation-detail-card">
                    <h4>Decision history</h4>
                    <ul className="moderation-decisions">
                      {alertDetail.moderation.decisions.map((decision) => (
                        <li key={decision.id}>
                          <strong>{decision.action}</strong> by {decision.actor?.displayName || "moderator"} •{" "}
                          {formatTimestamp(decision.createdAt)}{" "}
                          {decision.notes ? <span className="moderation-decision-notes">“{decision.notes}”</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="moderation-detail-card">
                  <h4>Apply decision</h4>
                  <div className="moderation-decision-form">
                    <label htmlFor="moderation-decision-notes">
                      Notes / rationale
                      <textarea
                        id="moderation-decision-notes"
                        rows={3}
                        value={decisionNotes}
                        onChange={(event) => setDecisionNotes(event.target.value)}
                        placeholder="Add moderator notes..."
                      />
                    </label>
                    <label htmlFor="moderation-decision-override">
                      Override narrative (for Amend)
                      <textarea
                        id="moderation-decision-override"
                        rows={2}
                        value={overrideOutcome}
                        onChange={(event) => setOverrideOutcome(event.target.value)}
                        placeholder="Provide replacement narrative or outcome (optional)"
                      />
                    </label>
                    <div className="moderation-decision-actions">
                      <button
                        type="button"
                        onClick={() => applyDecision("approve")}
                        disabled={detailLoading}
                        data-testid="moderation-decision-approve"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDecision("amend")}
                        disabled={detailLoading}
                        data-testid="moderation-decision-amend"
                      >
                        Amend
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDecision("escalate")}
                        disabled={detailLoading}
                        data-testid="moderation-decision-escalate"
                      >
                        Escalate
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDecision("pause")}
                        disabled={detailLoading}
                        data-testid="moderation-decision-pause"
                      >
                        Pause
                      </button>
                    </div>
                  </div>
                </div>
                {alertDetail.contestSummary ? (
                  <div className="moderation-detail-card">
                    <h4>Contest telemetry summary</h4>
                    <pre>{JSON.stringify(alertDetail.contestSummary.summary, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="moderation-empty-detail">
              <p>Select an alert to review transcript context and apply overrides.</p>
            </div>
          )}
        </section>
      </div>
      <section className="moderation-sentiment" aria-label="Contest sentiment monitor">
        <h3>Contest Sentiment Monitor</h3>
        {sentimentError ? (
          <div className="moderation-error" role="alert">
            {sentimentError}
          </div>
        ) : null}
        {sentimentLoading ? (
          <p className="moderation-empty">Loading…</p>
        ) : sentimentOverview ? (
          <>
            <div className="moderation-detail-card">
              <h4>Sentiment Totals</h4>
              <div className="moderation-sentiment-totals">
                <span className="moderation-sentiment-total sentiment-negative">
                  Negative: {sentimentOverview.totals?.negative ?? 0}
                </span>
                <span className="moderation-sentiment-total sentiment-neutral">
                  Neutral: {sentimentOverview.totals?.neutral ?? 0}
                </span>
                <span className="moderation-sentiment-total sentiment-positive">
                  Positive: {sentimentOverview.totals?.positive ?? 0}
                </span>
                <span className="moderation-sentiment-total">
                  Samples: {sentimentOverview.totals?.total ?? 0}
                </span>
              </div>
              <p className="moderation-sentiment-cooldown">
                Cooldown spikes:{" "}
                {sentimentOverview.cooldown?.negativeDuringCooldown ?? 0} /
                {sentimentOverview.cooldown?.activeSamples ?? 0} active samples • Max remaining{" "}
                {formatDurationMs(sentimentOverview.cooldown?.maxRemainingCooldownMs ?? null)}
              </p>
            </div>
            {Array.isArray(sentimentOverview.hotspots) && sentimentOverview.hotspots.length > 0 ? (
              <div className="moderation-detail-card">
                <h4>Hotspots</h4>
                <ul className="moderation-sentiment-list">
                  {sentimentOverview.hotspots.slice(0, 5).map((hotspot) => (
                    <li key={`${hotspot.hubId || "unknown"}:${hotspot.roomId || "unknown"}`}>
                      <strong>
                        {hotspot.hubId || "Unknown hub"} • {hotspot.roomId || "Unknown room"}
                      </strong>
                      <span>
                        Negative: {hotspot.totals?.negative ?? 0} • Total: {hotspot.totals?.total ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(sentimentOverview.samples) && sentimentOverview.samples.length > 0 ? (
              <div className="moderation-detail-card">
                <h4>Latest Samples</h4>
                <ul className="moderation-sentiment-list">
                  {sentimentOverview.samples.map((sample, index) => (
                    <li
                      key={`${sample.contestId || sample.contestKey || "sample"}:${sample.issuedAtIso || index}`}
                    >
                      <span className={`moderation-sentiment-badge sentiment-${sample.sentiment || "unknown"}`}>
                        {sample.sentiment || "unknown"}
                      </span>
                      <span>
                        {sample.hubId || "Unknown hub"} • {sample.roomId || "Unknown room"}
                      </span>
                      <span>
                        {sample.phase || "unknown phase"} • Remaining{" "}
                        {formatDurationMs(sample.remainingCooldownMs ?? null)}
                      </span>
                      <span>{formatTimestamp(sample.issuedAtIso || sample.issuedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="moderation-empty">No sentiment samples captured yet.</p>
            )}
          </>
        ) : (
          <p className="moderation-empty">No sentiment samples captured yet.</p>
        )}
      </section>
      <section className="moderation-contest-artefacts" aria-label="Contest telemetry artefacts">
        <h3>Contest Telemetry Artefacts</h3>
        {contestArtefacts.length === 0 ? (
          <p className="moderation-empty">No contest artefacts captured yet.</p>
        ) : (
          <ul>
            {contestArtefacts.slice(0, 5).map((artefact) => (
              <li key={artefact.path}>
                <span>{artefact.name}</span>
                <span className="moderation-artefact-meta">
                  {formatTimestamp(artefact.modifiedAt)} • {(artefact.size / 1024).toFixed(1)} KiB
                </span>
              </li>
            ))}
          </ul>
        )}
        {latestContestSummary ? (
          <div className="moderation-detail-card">
            <h4>Latest contest load summary</h4>
            <pre>{JSON.stringify(latestContestSummary.summary, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
