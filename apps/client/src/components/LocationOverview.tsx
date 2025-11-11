import { useChronicleStore } from '../stores/chronicleStore';

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

  const breadcrumb = location.breadcrumb.map((entry) => entry.name).join(' › ');
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
        <span className="location-pill-path" title={breadcrumb}>
          {breadcrumb}
        </span>
        <span>{detail}</span>
        {meta ? <span className="location-pill-meta">{meta}</span> : null}
      </div>
    </div>
  );
}
