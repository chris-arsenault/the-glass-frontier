import React from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { AtlasLink } from '../../atlas/AtlasLink';
import './LocationOverview.css';

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
          <AtlasLink className="location-pill-link" slug={locationSlug} title="Open in World Atlas">
            {locationName}
          </AtlasLink>
        ) : (
          <span>{locationName}</span>
        )}
      </div>
    </div>
  );
}
