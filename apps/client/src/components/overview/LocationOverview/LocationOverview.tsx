import React from 'react';

import './LocationOverview.css';
import { useChronicleStore } from '../../../stores/chronicleStore';

/**
 * Where the scene is, as the GM named it.
 *
 * The Atlas link appears only while the chronicle is still at the canon place
 * it started from — once play moves on, the location is a name and there is
 * nothing in the world to link to.
 */
export function LocationOverview() {
  const locationName = useChronicleStore((state) => state.locationName);
  const locationSlug = useChronicleStore((state) => state.locationSlug);
  const startedAt = useChronicleStore((state) => state.startLocationName);

  if (!locationName) {
    return (
      <div className="location-pill location-pill-empty" aria-live="polite">
        <span className="location-pill-label">Location</span>
        <span className="location-pill-value">Unknown</span>
      </div>
    );
  }

  const isAtCanonStart = locationSlug !== null && locationName === startedAt;

  return (
    <div className="location-pill">
      <div className="location-pill-label">Location</div>
      <div className="location-pill-value">
        {isAtCanonStart ? (
          <button
            type="button"
            className="location-pill-link"
            title="Open in World Atlas"
            onClick={() => window.open(`/atlas/${locationSlug}`, '_blank', 'noopener,noreferrer')}
          >
            {locationName}
          </button>
        ) : (
          <span>{locationName}</span>
        )}
      </div>
    </div>
  );
}
