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
    sessionAdminAlerts
  } = useSessionContext();
  const accountContext = useAccountContext() || {};

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
  const pipelineHistory = Array.isArray(sessionOfflineHistory)
    ? sessionOfflineHistory.slice().reverse().slice(0, 4)
    : [];
  const pipelineAlerts = Array.isArray(sessionAdminAlerts)
    ? sessionAdminAlerts.slice().reverse().slice(0, 3)
    : [];
  const offlineJob = sessionOfflineJob || null;
  const pipelineStatus =
    offlineJob?.status || (sessionPendingOffline ? "queued" : "idle");
  const moderationQueueCount = Array.isArray(accountContext.sessions)
    ? accountContext.sessions.filter((entry) => entry?.requiresApproval).length
    : 0;

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
          <dl className="overlay-pipeline-details">
            <div>
              <dt>Current status</dt>
              <dd>
                {titleCase(pipelineStatus)}
                {offlineJob?.jobId ? ` (${offlineJob.jobId.slice(0, 8)})` : ""}
              </dd>
            </div>
            <div>
              <dt>Pending offline</dt>
              <dd>{sessionPendingOffline ? "Yes" : "No"}</dd>
            </div>
            <div>
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
          {pipelineHistory.length > 0 ? (
            <div className="overlay-pipeline-history">
              <p className="overlay-pipeline-subheading">Recent transitions</p>
              <ul>
                {pipelineHistory.map((entry, index) => (
                  <li key={`${entry.jobId || "job"}-${index}`}>
                    <span className={`overlay-pipeline-badge status-${entry.status || "unknown"}`}>
                      {titleCase(entry.status || "unknown")}
                    </span>
                    <span className="overlay-pipeline-meta">
                      {entry.at ? formatIso(entry.at) : "Unknown time"}
                      {entry.durationMs ? ` • ${formatDuration(entry.durationMs)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {pipelineAlerts.length > 0 ? (
            <div className="overlay-pipeline-alerts" role="alert">
              <p className="overlay-pipeline-subheading">Alerts</p>
              <ul>
                {pipelineAlerts.map((alert, index) => (
                  <li key={`${alert.reason || "alert"}-${index}`}>
                    <span className={`overlay-pipeline-badge severity-${alert.severity || "info"}`}>
                      {titleCase(alert.severity || "info")}
                    </span>
                    <span className="overlay-pipeline-meta">
                      {alert.message || alert.reason || "Alert"} •{" "}
                      {alert.at ? formatIso(alert.at) : "Unknown time"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      <AdminVerbCatalogPanel />
    </aside>
  );
}
