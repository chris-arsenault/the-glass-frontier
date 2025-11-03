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
    case "wrap-soon":
      return marker.reason ? `Wrap suggested: ${marker.reason}` : "Wrap suggested";
    case "pause":
      return marker.reason ? `Pause: ${marker.reason}` : "Pause issued";
    default:
      return marker.marker || "Session marker";
  }
}

export function SessionMarkerRibbon() {
  const {
    markers,
    sendPlayerControl,
    isSendingControl,
    controlError,
    lastPlayerControl
  } = useSessionContext();
  const recentMarkers = useMemo(() => markers.slice(-6), [markers]);
  const controlFeedback = useMemo(() => {
    if (controlError) {
      return `Wrap request failed: ${controlError.message}`;
    }
    if (lastPlayerControl && lastPlayerControl.type === "wrap") {
      const turns = typeof lastPlayerControl.turns === "number" ? lastPlayerControl.turns : null;
      const turnCopy = turns ? `${turns} ${turns === 1 ? "turn" : "turns"}` : "your chosen window";
      return `Wrap request submitted: ${turnCopy}.`;
    }
    return "";
  }, [controlError, lastPlayerControl]);

  const handleWrap = (turns) => {
    if (typeof sendPlayerControl !== "function") {
      return () => {};
    }

    return () => {
      sendPlayerControl({ type: "wrap", turns }).catch(() => {});
    };
  };

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
      <div className="session-wrap-controls" role="group" aria-label="Session wrap controls">
        <button
          type="button"
          className="wrap-control-button"
          onClick={handleWrap(1)}
          disabled={isSendingControl}
          data-testid="wrap-control-1"
        >
          Wrap after 1 turn
        </button>
        <button
          type="button"
          className="wrap-control-button"
          onClick={handleWrap(2)}
          disabled={isSendingControl}
          data-testid="wrap-control-2"
        >
          Wrap after 2 turns
        </button>
        <button
          type="button"
          className="wrap-control-button"
          onClick={handleWrap(3)}
          disabled={isSendingControl}
          data-testid="wrap-control-3"
        >
          Wrap after 3 turns
        </button>
      </div>
      <p className="session-wrap-feedback" aria-live="polite" data-testid="wrap-feedback">
        {controlFeedback || ""}
      </p>
    </aside>
  );
}
