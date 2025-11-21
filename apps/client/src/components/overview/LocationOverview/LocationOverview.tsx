import React from 'react';

import './LocationOverview.css';
import { useChronicleStore } from '../../../stores/chronicleStore';

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

  const current = location.breadcrumb.at(-1);
  const locationName = current?.name ?? 'Unknown';
  const locationSlug = location.slug ?? location.anchorPlaceId;
  const status = location.status.join(', ');
  const tagSnippet = location.tags.slice(0, 3).join(', ');
  const certaintyLabel =
    location.certainty === 'exact' ? 'fixed position' : location.certainty.toUpperCase();
  const meta = [status, certaintyLabel].filter(Boolean).join(' · ');
  const detail = location.description || tagSnippet || 'Exploring new ground.';

  return (
    <div className="location-pill">
      <div className="location-pill-label">Location</div>
      <div className="location-pill-value">
        <button
          type="button"
          className="location-pill-link"
          title="Open in World Atlas"
          onClick={() => window.open(`/atlas/${locationSlug}`, '_blank', 'noopener,noreferrer')}
        >
          {locationName}
        </button>
        <span>{detail}</span>
        {meta ? <span className="location-pill-meta">{meta}</span> : null}
      </div>
    </div>
  );
}
