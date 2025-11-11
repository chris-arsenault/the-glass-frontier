import { useChronicleStore } from "../stores/chronicleStore";

export function LocationOverview() {
  const location = useChronicleStore((state) => state.location);

  if (!location) {
    return (
      <div className="location-pill location-pill-empty" aria-live="polite">
        <span className="location-pill-label">Location</span>
        <span className="location-pill-value">Unknown</span>
      </div>
    );
  }

  return (
    <div className="location-pill">
      <div className="location-pill-label">{location.locale ?? "Unknown Locale"}</div>
      <div className="location-pill-value">
        {location.atmosphere ?? "Atmospheric details unavailable."}
      </div>
    </div>
  );
}
