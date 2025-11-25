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

  const locationName = location.name ?? 'Unknown';
  const locationSlug = location.slug;
  const status = location.status ?? '';
  const tagSnippet = location.tags.slice(0, 3).join(', ');
  const meta = [location.subkind, status].filter(Boolean).join(' · ');
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
