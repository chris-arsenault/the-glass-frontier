import type { EntityAvailability } from '@glass-frontier/dto';
import { Link } from 'react-router-dom';

import { useChronicleStore } from '../../../stores/chronicleStore';
import './AvailableEntitiesPanel.css';

const availabilityLabel: Record<EntityAvailability, string> = {
  anchor: 'chronicle anchor',
  connected: 'connected',
  location: 'current location',
  recent: 'recently involved',
  scene: 'active scene',
};

export function AvailableEntitiesPanel(): React.JSX.Element | null {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const isSending = useChronicleStore((state) => state.isSending);
  const selectedEntityIds = useChronicleStore((state) => state.selectedEntityIds);
  const toggleEntityTarget = useChronicleStore((state) => state.toggleEntityTarget);

  if (chronicle === null || chronicle.status === 'closed') {
    return null;
  }
  const entries = chronicle.entityRoster.entries;

  return (
    <section className="available-entities" aria-labelledby="available-entities-title">
      <div className="available-entities-heading">
        <div>
          <h2 id="available-entities-title">Nearby entities</h2>
          <p>Choose established people, places, or groups to address in your next move.</p>
        </div>
        {selectedEntityIds.length > 0 ? (
          <span className="available-entities-count">{selectedEntityIds.length}/3 selected</span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="available-entities-empty">The GM is gathering the new scene.</p>
      ) : (
        <ul className="available-entities-list">
          {entries.map((entity) => {
            const selected = selectedEntityIds.includes(entity.id);
            const selectionFull = selectedEntityIds.length >= 3 && !selected;
            return (
              <li className="available-entity" key={entity.id}>
                <button
                  type="button"
                  className={`available-entity-select${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  disabled={isSending || selectionFull}
                  onClick={() => toggleEntityTarget(entity.id)}
                >
                  <span className="available-entity-name">{entity.name}</span>
                  <span className="available-entity-kind">{entity.subkind ?? entity.kind}</span>
                </button>
                <div className="available-entity-reasons">
                  {entity.availability.map((reason) => (
                    <span key={reason}>{availabilityLabel[reason]}</span>
                  ))}
                </div>
                <Link className="available-entity-atlas" to={`/atlas/${entity.slug}`}>
                  Atlas
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
