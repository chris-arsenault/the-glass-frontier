import { useCallback, useMemo, useState } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";
import { SessionConnectionStates } from "../hooks/useSessionConnection.js";
import { useAccountContext } from "../context/AccountContext.jsx";
import { CheckOverlay } from "./CheckOverlay.jsx";
import { AdminVerbCatalogPanel } from "./AdminVerbCatalogPanel.jsx";

function formatIso(isoString) {
  if (!isoString) {
    return null;
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

function describeCadence(cadence) {
  if (!cadence) {
    return "Publishing cadence pending.";
  }
  const digest = cadence.nextDigestAt ? `Digest @ ${formatIso(cadence.nextDigestAt)}` : null;
  const batch = cadence.nextBatchAt ? `Batch @ ${formatIso(cadence.nextBatchAt)}` : null;
  const parts = [batch, digest].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "Publishing cadence pending.";
}

function titleCase(value) {
  if (!value) {
    return "Unknown";
  }
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRelationshipStatus(status) {
  return titleCase(status || "unknown");
}

function formatDuration(durationMs) {
  if (typeof durationMs !== "number" || Number.isNaN(durationMs) || durationMs < 0) {
    return "Unknown";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

const PIPELINE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alerts", label: "Alerts" },
  { value: "runs", label: "Runs" }
];

function formatRelativeTime(isoString) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (Number.isNaN(diffMs)) {
    return null;
  }
  if (Math.abs(diffMs) < 60000) {
    return diffMs >= 0 ? "just now" : "in under 1m";
  }
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) {
    return minutes >= 0 ? `${minutes}m ago` : `in ${Math.abs(minutes)}m`;
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return hours >= 0 ? `${hours}h ago` : `in ${Math.abs(hours)}h`;
  }
  const days = Math.round(hours / 24);
  return days >= 0 ? `${days}d ago` : `in ${Math.abs(days)}d`;
}

function pipelineAlertIdentifier(alert) {
  if (!alert || typeof alert !== "object") {
    return "alert";
  }
  const reason = alert.reason || alert.message || "alert";
  const timestamp = alert.at || alert.timestamp || "";
  const severity = alert.severity || "info";
  return `${reason}|${timestamp}|${severity}`;
}

function emitTelemetry(eventName, detail = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const { dispatchEvent, CustomEvent: WindowCustomEvent } = window;
  if (typeof dispatchEvent !== "function" || typeof WindowCustomEvent !== "function") {
    return;
  }
  try {
    dispatchEvent(
      new WindowCustomEvent("gf.telemetry", {
        detail: {
          event: eventName,
          timestamp: new Date().toISOString(),
          ...detail
        }
      })
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("Failed to dispatch telemetry event", eventName, error);
    }
  }
}

const FALLBACK_CHARACTER = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer",
  background: "Former archivist tracking lost frontier tech.",
  stats: {
    ingenuity: 1,
    resolve: 1,
    finesse: 2,
    presence: 1,
    weird: 0,
    grit: 1
  }
};

const FALLBACK_INVENTORY = [
  { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] },
  { id: "relay-kit", name: "Relay Stabilisation Kit", tags: ["utility"] }
];

export function OverlayDock() {
  const {
    overlay,
    connectionState,
    isOffline,
    queuedIntents,
    sessionStatus,
    sessionClosedAt,
    sessionPendingOffline,
    sessionCadence,
    isAdmin,
    sessionOfflineJob,
    sessionOfflineHistory,
    sessionOfflineLastRun,
    sessionAdminAlerts,
    pipelinePreferences,
    setPipelineFilter,
    togglePipelineTimeline,
    acknowledgePipelineAlert
  } = useSessionContext();
  const accountContext = useAccountContext() || {};
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const character = overlay?.character || FALLBACK_CHARACTER;
  const inventory = Array.isArray(overlay?.inventory) && overlay.inventory.length > 0
    ? overlay.inventory
    : FALLBACK_INVENTORY;
  const momentumValue =
    typeof overlay?.momentum?.current === "number" ? overlay.momentum.current : 0;
  const stats = character.stats || {};
  const traits = Array.isArray(character.tags) ? character.tags : [];
  const relationships = Array.isArray(overlay?.relationships) ? overlay.relationships : [];
  const sessionClosed = sessionStatus === "closed";
  const queuedCount = Array.isArray(queuedIntents) ? queuedIntents.length : 0;
  const queueLabel = queuedCount === 1 ? "intent" : "intents";
  const offlineActive =
    sessionPendingOffline ||
    isOffline ||
    connectionState === SessionConnectionStates.FALLBACK ||
    connectionState === SessionConnectionStates.OFFLINE ||
    queuedCount > 0;
  const statusLabel = sessionClosed
    ? "Closed"
    : offlineActive
    ? queuedCount > 0
      ? `Offline queue (${queuedCount})`
      : "Offline mode"
    : "Live";
  const cadenceLabel = sessionCadence ? describeCadence(sessionCadence) : null;
  const statusClassName = [
    "overlay-status",
    sessionClosed ? "overlay-status-closed" : "",
    !sessionClosed && offlineActive ? "overlay-status-offline" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const resolvedPipelinePreferences = useMemo(
    () =>
      pipelinePreferences && typeof pipelinePreferences === "object"
        ? {
            filter: PIPELINE_FILTER_OPTIONS.some((option) => option.value === pipelinePreferences.filter)
              ? pipelinePreferences.filter
              : "all",
            timelineExpanded: Boolean(pipelinePreferences.timelineExpanded),
            acknowledged: Array.isArray(pipelinePreferences.acknowledged)
              ? pipelinePreferences.acknowledged.slice()
              : []
          }
        : { filter: "all", timelineExpanded: false, acknowledged: [] },
    [pipelinePreferences]
  );
  const pipelineHistory = useMemo(() => {
    if (!Array.isArray(sessionOfflineHistory)) {
      return [];
    }
    return sessionOfflineHistory.slice().reverse();
  }, [sessionOfflineHistory]);
  const rawPipelineAlerts = useMemo(() => {
    if (!Array.isArray(sessionAdminAlerts)) {
      return [];
    }
    return sessionAdminAlerts.slice().reverse();
  }, [sessionAdminAlerts]);
  const acknowledgedAlerts = useMemo(() => {
    return new Set(resolvedPipelinePreferences.acknowledged || []);
  }, [resolvedPipelinePreferences.acknowledged]);
  const pipelineAlerts = useMemo(
    () =>
      rawPipelineAlerts.filter((alert) => !acknowledgedAlerts.has(pipelineAlertIdentifier(alert))).slice(0, 5),
    [acknowledgedAlerts, rawPipelineAlerts]
  );
  const offlineJob = sessionOfflineJob || null;
  const pipelineStatus =
    offlineJob?.status || (sessionPendingOffline ? "queued" : "idle");
  const moderationQueueCount = Array.isArray(accountContext.sessions)
    ? accountContext.sessions.filter((entry) => entry?.requiresApproval).length
    : 0;
  const filterValue = resolvedPipelinePreferences.filter;
  const timelineExpanded = resolvedPipelinePreferences.timelineExpanded;
  const displayedHistory = useMemo(
    () => (timelineExpanded ? pipelineHistory.slice(0, 6) : pipelineHistory.slice(0, 1)),
    [pipelineHistory, timelineExpanded]
  );
  const hasAdditionalHistory = pipelineHistory.length > displayedHistory.length;
  const shouldShowHistory = filterValue !== "alerts" && displayedHistory.length > 0;
  const shouldShowAlerts = filterValue !== "runs" && pipelineAlerts.length > 0;
  const showAlertsEmptyState = filterValue === "alerts" && pipelineAlerts.length === 0;
  const showHistoryEmptyState = filterValue === "runs" && displayedHistory.length === 0;
  const latestJobId = offlineJob?.jobId ? offlineJob.jobId.slice(0, 8) : null;
  const summaryLabel = useMemo(() => {
    const parts = [];
    parts.push(titleCase(pipelineStatus || "unknown"));
    if (latestJobId) {
      parts.push(`Job ${latestJobId}`);
    }
    const failureAlert =
      rawPipelineAlerts.find((alert) => alert.severity === "high") ||
      pipelineHistory.find((entry) => entry.status === "failed");
    if (failureAlert?.at) {
      const relative = formatRelativeTime(failureAlert.at);
      if (relative) {
        parts.push(`Last failure ${relative}`);
      }
    } else if (sessionOfflineLastRun?.completedAt) {
      const relative = formatRelativeTime(sessionOfflineLastRun.completedAt);
      if (relative) {
        parts.push(`Last run ${relative}`);
      }
    }
    if (parts.length === 0) {
      return "Pipeline status unavailable";
    }
    return parts.join(" • ");
  }, [latestJobId, pipelineHistory, pipelineStatus, rawPipelineAlerts, sessionOfflineLastRun]);
  const timelineToggleLabel = timelineExpanded ? "Hide timeline" : "Show timeline";
  const timelineToggleAvailable = pipelineHistory.length > 1;
  const handleFilterSelect = useCallback(
    (value) => {
      if (typeof setPipelineFilter === "function") {
        setPipelineFilter(value);
      }
      emitTelemetry("client.pipeline.filter.selected", { filter: value });
    },
    [setPipelineFilter]
  );
  const handleTimelineToggle = useCallback(() => {
    if (typeof togglePipelineTimeline === "function") {
      togglePipelineTimeline();
    }
    emitTelemetry("client.pipeline.timeline.toggled", {
      expanded: !timelineExpanded
    });
  }, [timelineExpanded, togglePipelineTimeline]);
  const handleAlertAcknowledge = useCallback(
    (alert) => {
      if (typeof acknowledgePipelineAlert === "function") {
        acknowledgePipelineAlert(alert);
      }
      emitTelemetry("client.pipeline.alert.acknowledged", {
        severity: alert?.severity || "info",
        reason: alert?.reason || "alert"
      });
    },
    [acknowledgePipelineAlert]
  );
  const handleDetailsToggle = useCallback(() => {
    setDetailsExpanded((expanded) => {
      const next = !expanded;
      emitTelemetry("client.pipeline.details.toggled", { expanded: next });
      return next;
    });
  }, []);

  return (
    <aside className="overlay-dock" aria-label="Session overlays" data-testid="overlay-dock">
      <CheckOverlay />
      <section
        className="overlay-card overlay-character"
        aria-labelledby="overlay-character-heading"
      >
        <header className="overlay-card-header">
          <div>
            <h2 id="overlay-character-heading">Character Sheet</h2>
            <p className="overlay-subheading" aria-live="polite">
              {character.background}
            </p>
            {cadenceLabel ? (
              <p className="overlay-cadence" aria-live="polite">
                {cadenceLabel}
              </p>
            ) : null}
          </div>
          <span
            className={statusClassName}
            aria-live="polite"
            data-testid="overlay-status"
          >
            {statusLabel}
          </span>
        </header>
        <dl className="overlay-character-details">
          <div>
            <dt>Name</dt>
            <dd>{character.name}</dd>
          </div>
          <div>
            <dt>Pronouns</dt>
            <dd>{character.pronouns}</dd>
          </div>
          <div>
            <dt>Archetype</dt>
            <dd>{character.archetype}</dd>
          </div>
          <div>
            <dt>Momentum</dt>
            <dd data-testid="overlay-momentum">{momentumValue}</dd>
          </div>
        </dl>
        <div className="overlay-stat-grid">
          {Object.entries(stats).map(([stat, value]) => (
            <span key={stat} className="overlay-stat-chip">
              <span className="overlay-stat-label">{stat}</span>
              <span className="overlay-stat-value">{value}</span>
            </span>
          ))}
        </div>
        {traits.length > 0 ? (
          <div className="overlay-traits" role="list" aria-label="Character traits">
            {traits.map((trait) => (
              <span key={trait} className="overlay-trait-chip" role="listitem">
                {trait}
              </span>
            ))}
          </div>
        ) : null}
        {sessionClosed ? (
          <p className="overlay-alert" role="status" data-testid="overlay-closed-status">
            Session closed
            {sessionClosedAt ? ` @ ${formatIso(sessionClosedAt)}` : ""}.{" "}
            {sessionPendingOffline
              ? `Offline reconciliation pending.${
                  cadenceLabel ? ` ${cadenceLabel}.` : ""
                }`
              : "Offline reconciliation complete."}
          </p>
        ) : overlay?.pendingOfflineReconcile || sessionPendingOffline ? (
          <p className="overlay-alert" role="status">
            Offline changes pending sync
            {queuedCount > 0 ? ` (${queuedCount} ${queueLabel} queued)` : ""}
            {cadenceLabel ? ` • ${cadenceLabel}.` : "."}
          </p>
        ) : offlineActive ? (
          <p className="overlay-alert" role="status">
            Connection degraded — updates will sync automatically once online.
          </p>
        ) : null}
      </section>
      <section
        className="overlay-card overlay-inventory"
        aria-labelledby="overlay-inventory-heading"
      >
        <header className="overlay-card-header">
          <h2 id="overlay-inventory-heading">Inventory</h2>
          <span className="overlay-meta" aria-live="polite">
            Revision {overlay?.revision ?? 0}
          </span>
        </header>
        <ul className="overlay-inventory-list">
          {inventory.map((item) => (
            <li key={item.id}>
              <span className="overlay-item-name">{item.name}</span>
              <span className="overlay-item-tags">{Array.isArray(item.tags) ? item.tags.join(", ") : ""}</span>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="overlay-card overlay-relationships"
        aria-labelledby="overlay-relationships-heading"
      >
        <header className="overlay-card-header">
          <h2 id="overlay-relationships-heading">Allies & Factions</h2>
          <span className="overlay-meta" aria-live="polite">
            {relationships.length} tracked
          </span>
        </header>
        {relationships.length > 0 ? (
          <ul className="overlay-relationships-list">
            {relationships.map((relationship) => (
              <li key={relationship.id} className="overlay-relationship-item">
                <div className="overlay-relationship-header">
                  <span className="overlay-relationship-name">
                    {relationship.name || relationship.id || "Unknown"}
                  </span>
                  <span
                    className={`overlay-relationship-status overlay-relationship-status-${relationship.status || "unknown"}`}
                  >
                    {formatRelationshipStatus(relationship.status)}
                  </span>
                </div>
                <p className="overlay-relationship-meta">
                  Bond {typeof relationship.bond === "number" ? relationship.bond : "—"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="overlay-muted">No relationships recorded yet.</p>
        )}
      </section>
      {isAdmin ? (
        <section
          className="overlay-card overlay-pipeline"
          aria-labelledby="overlay-pipeline-heading"
          data-testid="overlay-pipeline"
        >
          <header className="overlay-card-header">
            <h2 id="overlay-pipeline-heading">Pipeline Status</h2>
            <span className="overlay-meta">
              Moderation queue: {moderationQueueCount}
            </span>
          </header>
          <div className="overlay-pipeline-summary-row">
            <p className="overlay-pipeline-summary" aria-live="polite">
              {summaryLabel}
            </p>
            <button
              type="button"
              className="overlay-pipeline-details-toggle"
              onClick={handleDetailsToggle}
              aria-expanded={detailsExpanded}
              data-testid="pipeline-details-toggle"
            >
              {detailsExpanded ? "Hide details" : "Show details"}
            </button>
          </div>
          {detailsExpanded ? (
            <dl className="overlay-pipeline-details">
              <div className="overlay-pipeline-detail">
                <dt>Status</dt>
                <dd>
                  {titleCase(pipelineStatus)}
                  {latestJobId ? ` (${latestJobId})` : ""}
                </dd>
              </div>
              <div className="overlay-pipeline-detail">
                <dt>Pending offline</dt>
                <dd>{sessionPendingOffline ? "Yes" : "No"}</dd>
              </div>
              <div className="overlay-pipeline-detail">
                <dt>Latest run</dt>
                <dd>
                  {sessionOfflineLastRun?.completedAt
                    ? `${formatIso(sessionOfflineLastRun.completedAt)} • ${formatDuration(
                        sessionOfflineLastRun.durationMs
                      )}`
                    : "No runs yet"}
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="overlay-pipeline-toolbar" role="toolbar" aria-label="Pipeline controls">
            <div
              className="overlay-pipeline-filter-group"
              role="group"
              aria-label="Pipeline filters"
            >
              {PIPELINE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`overlay-pipeline-filter${
                    filterValue === option.value ? " overlay-pipeline-filter-active" : ""
                  }`}
                  aria-pressed={filterValue === option.value}
                  onClick={() => handleFilterSelect(option.value)}
                  data-testid={`pipeline-filter-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {timelineToggleAvailable ? (
              <button
                type="button"
                className="overlay-pipeline-timeline-toggle"
                onClick={handleTimelineToggle}
                aria-pressed={timelineExpanded}
                data-testid="pipeline-timeline-toggle"
              >
                {timelineToggleLabel}
              </button>
            ) : null}
          </div>
          {shouldShowAlerts ? (
            <div
              className="overlay-pipeline-alerts"
              role="region"
              aria-labelledby="overlay-pipeline-alerts-heading"
            >
              <p className="overlay-pipeline-subheading" id="overlay-pipeline-alerts-heading">
                Alerts
              </p>
              <ul>
                {pipelineAlerts.map((alert, index) => {
                  const key = pipelineAlertIdentifier(alert);
                  const isSeeded = alert?.isSeeded === true;
                  const isDebug = alert?.isDebug === true;
                  const tagLabel = isSeeded ? "Seeded fallback" : isDebug ? "Debug" : null;
                  const tagClassName = isSeeded
                    ? "overlay-pipeline-tag overlay-pipeline-tag-fallback"
                    : isDebug
                    ? "overlay-pipeline-tag overlay-pipeline-tag-debug"
                    : null;
                  const tagTestId = isSeeded
                    ? "pipeline-alert-seeded"
                    : isDebug
                    ? "pipeline-alert-debug"
                    : null;
                  return (
                    <li key={key}>
                      <span
                        className={`overlay-pipeline-alert-icon severity-${alert.severity || "info"}`}
                        aria-hidden="true"
                      >
                        !
                      </span>
                      <div className="overlay-pipeline-alert-body">
                        <div className="overlay-pipeline-alert-heading">
                          <span className={`overlay-pipeline-badge severity-${alert.severity || "info"}`}>
                            {titleCase(alert.severity || "info")}
                          </span>
                          <span className="overlay-pipeline-alert-message">
                            {alert.message || alert.reason || "Alert"}
                          </span>
                          {tagLabel && tagClassName ? (
                            <span className={tagClassName} data-testid={tagTestId}>
                              {tagLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="overlay-pipeline-meta">
                          {alert.at ? formatIso(alert.at) : "Unknown time"}
                          {tagLabel && alert?.data?.seedSource
                            ? ` • Source: ${alert.data.seedSource}`
                            : null}
                        </p>
                        <button
                          type="button"
                          className="overlay-pipeline-ack"
                          onClick={() => handleAlertAcknowledge(alert)}
                          aria-label={`Acknowledge alert ${titleCase(alert.reason || "alert")}`}
                          data-testid={`pipeline-ack-${index}`}
                        >
                          Acknowledge
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {showAlertsEmptyState ? (
            <p className="overlay-muted overlay-pipeline-empty">No active alerts.</p>
          ) : null}
          {shouldShowHistory ? (
            <div
              className="overlay-pipeline-history"
              role="region"
              aria-labelledby="overlay-pipeline-history-heading"
            >
              <p className="overlay-pipeline-subheading" id="overlay-pipeline-history-heading">
                Recent transitions
              </p>
              <ul>
                {displayedHistory.map((entry, index) => (
                  <li key={`${entry.jobId || "job"}-${index}`}>
                    <span className={`overlay-pipeline-badge status-${entry.status || "unknown"}`}>
                      {titleCase(entry.status || "unknown")}
                    </span>
                    <div className="overlay-pipeline-history-body">
                      <span className="overlay-pipeline-meta">
                        {entry.at ? formatIso(entry.at) : "Unknown time"}
                        {entry.durationMs ? ` • ${formatDuration(entry.durationMs)}` : ""}
                      </span>
                      {entry.message ? (
                        <span className="overlay-pipeline-history-message">{entry.message}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {!timelineExpanded && hasAdditionalHistory ? (
                <p className="overlay-pipeline-meta overlay-pipeline-hint">
                  Additional events hidden — select "{timelineToggleLabel}" to expand.
                </p>
              ) : null}
            </div>
          ) : null}
          {showHistoryEmptyState ? (
            <p className="overlay-muted overlay-pipeline-empty">No pipeline transitions yet.</p>
          ) : null}
        </section>
      ) : null}
      <AdminVerbCatalogPanel />
    </aside>
  );
}
