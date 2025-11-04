import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccountContext } from "../context/AccountContext.jsx";

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
  const { fetchWithAuth, setFlashMessage } = useAccountContext();
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

  useEffect(() => {
    loadAlerts();
    loadContestArtefacts();
  }, [loadAlerts, loadContestArtefacts]);

  useEffect(() => {
    if (selectedAlertId) {
      loadAlertDetail(selectedAlertId);
    }
  }, [selectedAlertId, loadAlertDetail]);

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
      } catch (decisionError) {
        setError(decisionError.message);
      } finally {
        setDetailLoading(false);
      }
    },
    [decisionNotes, fetchWithAuth, loadAlertDetail, loadAlerts, overrideOutcome, selectedAlertId, setFlashMessage]
  );

  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) {
      return null;
    }
    return alerts.find((alert) => alert.id === selectedAlertId) || null;
  }, [alerts, selectedAlertId]);

  return (
    <div className="moderation-dashboard" data-testid="moderation-dashboard">
      <header className="moderation-dashboard-header">
        <div>
          <h2>Moderation Dashboard</h2>
          <p>Live override queue, contest telemetry snapshots, and decision audit trail.</p>
        </div>
        <div className="moderation-dashboard-stats">
          <span title="Live alerts">Live: {stats.live}</span>
          <span title="Queued for follow-up">Queued: {stats.queued}</span>
          <span title="Escalated to admins">Escalated: {stats.escalated}</span>
          <span title="Resolved alerts">Resolved: {stats.resolved}</span>
        </div>
        <button type="button" onClick={loadAlerts} className="moderation-refresh-button">
          Refresh
        </button>
      </header>
      {error ? (
        <div className="moderation-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="moderation-layout">
        <section className="moderation-columns" aria-label="Moderation alert columns">
          {STATUS_ORDER.map((status) => (
            <div key={status} className={`moderation-column moderation-column-${status}`}>
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
                <span className="moderation-detail-status">Status: {selectedAlert.status}</span>
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
                      >
                        Approve
                      </button>
                      <button type="button" onClick={() => applyDecision("amend")} disabled={detailLoading}>
                        Amend
                      </button>
                      <button type="button" onClick={() => applyDecision("escalate")} disabled={detailLoading}>
                        Escalate
                      </button>
                      <button type="button" onClick={() => applyDecision("pause")} disabled={detailLoading}>
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
