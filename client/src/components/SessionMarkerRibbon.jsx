import { useMemo } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";

function markerLabel(marker) {
  switch (marker.marker) {
    case "narrative-beat":
      return "Narrative beat";
    case "check-requested":
      return `Check requested: ${marker.move || "unknown move"}`;
    case "momentum-snapshot":
      return `Momentum snapshot: ${marker.value}`;
    case "momentum-state":
      return `Momentum state: ${marker.value}`;
    default:
      return marker.marker || "Session marker";
  }
}

export function SessionMarkerRibbon() {
  const { markers } = useSessionContext();
  const recentMarkers = useMemo(() => markers.slice(-6), [markers]);

  return (
    <aside
      className="session-ribbon"
      aria-label="Session pacing markers"
      data-testid="session-marker-ribbon"
    >
      <h2 className="session-ribbon-title">Pacing Ribbon</h2>
      {recentMarkers.length === 0 ? (
        <p className="session-ribbon-empty">Markers will appear as the session unfolds.</p>
      ) : (
        <ol className="session-ribbon-list">
          {recentMarkers.map((marker) => (
            <li key={marker.id} className={`session-marker session-marker-${marker.marker}`}>
              <span className="session-marker-label">{markerLabel(marker)}</span>
              {typeof marker.value !== "undefined" ? (
                <span className="session-marker-value">{marker.value}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

