import { useMemo } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";
import { SessionConnectionStates } from "../hooks/useSessionConnection.js";

const placeholderCharacter = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer",
  momentum: 0
};

const placeholderInventory = [
  { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] },
  { id: "relay-kit", name: "Relay Stabilisation Kit", tags: ["utility"] }
];

function selectLatestMomentum(markers) {
  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index];
    if (marker.marker === "momentum-state") {
      return marker;
    }
  }
  return null;
}

export function OverlayDock() {
  const { markers, connectionState } = useSessionContext();

  const momentumMarker = useMemo(() => selectLatestMomentum(markers), [markers]);

  const momentumValue =
    typeof momentumMarker?.value === "number" ? momentumMarker.value : placeholderCharacter.momentum;

  return (
    <aside className="overlay-dock" aria-label="Session overlays" data-testid="overlay-dock">
      <section
        className="overlay-card overlay-character"
        aria-labelledby="overlay-character-heading"
      >
        <header className="overlay-card-header">
          <h2 id="overlay-character-heading">Character Sheet</h2>
          <span className="overlay-status" aria-live="polite">
            {connectionState === SessionConnectionStates.FALLBACK ? "Offline mode" : "Live"}
          </span>
        </header>
        <dl className="overlay-character-details">
          <div>
            <dt>Name</dt>
            <dd>{placeholderCharacter.name}</dd>
          </div>
          <div>
            <dt>Pronouns</dt>
            <dd>{placeholderCharacter.pronouns}</dd>
          </div>
          <div>
            <dt>Archetype</dt>
            <dd>{placeholderCharacter.archetype}</dd>
          </div>
          <div>
            <dt>Momentum</dt>
            <dd data-testid="overlay-momentum">{momentumValue}</dd>
          </div>
        </dl>
      </section>
      <section
        className="overlay-card overlay-inventory"
        aria-labelledby="overlay-inventory-heading"
      >
        <header className="overlay-card-header">
          <h2 id="overlay-inventory-heading">Inventory</h2>
        </header>
        <ul className="overlay-inventory-list">
          {placeholderInventory.map((item) => (
            <li key={item.id}>
              <span className="overlay-item-name">{item.name}</span>
              <span className="overlay-item-tags">{item.tags.join(", ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
