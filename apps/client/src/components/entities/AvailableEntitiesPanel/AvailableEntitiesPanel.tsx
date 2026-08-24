import { Link } from 'react-router-dom';

import { useChronicleStore } from '../../../stores/chronicleStore';
import './AvailableEntitiesPanel.css';

export function AvailableEntitiesPanel(): React.JSX.Element | null {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);

  if (chronicle === null || chronicle.status === 'closed') {
    return null;
  }
  const entries = chronicle.entityRoster.entries;

  return (
    <section className="available-entities" aria-labelledby="available-entities-title">
      <h2 id="available-entities-title">Nearby</h2>
      {entries.length === 0 ? (
        <p className="available-entities-empty">Gathering the scene…</p>
      ) : (
        <ul className="available-entities-list">
          {entries.map((entity) => (
            <li className="available-entity" key={entity.id}>
              <Link
                className="available-entity-atlas"
                to={`/atlas/${entity.id}`}
                target="_blank"
                rel="noreferrer"
                title={`Open ${entity.name} in World Atlas in a new tab`}
              >
                <span className="available-entity-name">{entity.name}</span>
                <span className="available-entity-kind">{entity.subkind ?? entity.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
