import { useSessionContext } from "../context/SessionContext.jsx";
import { SessionConnectionStates } from "../hooks/useSessionConnection.js";
import { CheckOverlay } from "./CheckOverlay.jsx";
import { AdminVerbCatalogPanel } from "./AdminVerbCatalogPanel.jsx";

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
  const { overlay, connectionState, isOffline, queuedIntents } = useSessionContext();

  const character = overlay?.character || FALLBACK_CHARACTER;
  const inventory = Array.isArray(overlay?.inventory) && overlay.inventory.length > 0
    ? overlay.inventory
    : FALLBACK_INVENTORY;
  const momentumValue =
    typeof overlay?.momentum?.current === "number" ? overlay.momentum.current : 0;
  const stats = character.stats || {};
  const queuedCount = Array.isArray(queuedIntents) ? queuedIntents.length : 0;
  const queueLabel = queuedCount === 1 ? "intent" : "intents";
  const offlineActive =
    isOffline ||
    connectionState === SessionConnectionStates.FALLBACK ||
    connectionState === SessionConnectionStates.OFFLINE ||
    queuedCount > 0;
  const statusLabel = offlineActive
    ? queuedCount > 0
      ? `Offline queue (${queuedCount})`
      : "Offline mode"
    : "Live";

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
          </div>
          <span
            className={`overlay-status${offlineActive ? " overlay-status-offline" : ""}`}
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
        {overlay?.pendingOfflineReconcile ? (
          <p className="overlay-alert" role="status">
            Offline changes pending sync
            {queuedCount > 0 ? ` (${queuedCount} ${queueLabel} queued).` : "."}
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
      <AdminVerbCatalogPanel />
    </aside>
  );
}
