import { useChronicleStore } from '../../../stores/chronicleStore';
import { AtlasLink } from '../../atlas/AtlasLink';
import './AvailableEntitiesPanel.css';

export function AvailableEntitiesPanel(): React.JSX.Element | null {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);

  if (chronicle === null || chronicle.status === 'closed') {
    return null;
  }
  const entries = chronicle.entityRoster.entries;

  return (
    <section className="available-entities" aria-labelledby="available-entities-title">
      <h2 id="available-entities-title">Nearby entities</h2>
      {entries.length === 0 ? (
        <p className="available-entities-empty">Gathering the scene…</p>
      ) : (
        <ul className="available-entities-list">
          {entries.map((entity) => (
            <li className="available-entity" key={entity.id}>
              <AtlasLink
                className="available-entity-atlas"
                slug={entity.slug}
                title={`Open ${entity.name} in World Atlas`}
              >
                <span className="available-entity-name">{entity.name}</span>
                <span className="available-entity-kind">{entity.subkind ?? entity.kind}</span>
              </AtlasLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
