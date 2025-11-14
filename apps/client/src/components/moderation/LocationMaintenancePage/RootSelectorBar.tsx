import type { LocationPlace } from '@glass-frontier/dto';

type RootSelectorBarProps = {
  isLoading: boolean;
  onSelectRoot: (rootId: string) => void;
  roots: LocationPlace[];
  selectedRootId: string | null;
};

export const RootSelectorBar = ({
  isLoading,
  onSelectRoot,
  roots,
  selectedRootId,
}: RootSelectorBarProps) => {
  return (
    <div className="lm-root-bar">
      <div className="lm-root-bar-header">
        <p className="lm-panel-label">Location Roots</p>
        {isLoading ? <span className="lm-pending">Loading…</span> : null}
      </div>
      <div className="lm-root-scroll">
        {roots.length === 0 ? (
          <p className="lm-empty">No roots available.</p>
        ) : (
          roots.map((root) => (
            <button
              key={root.id}
              type="button"
              className={`lm-root-item${root.id === selectedRootId ? ' active' : ''}`}
              onClick={() => onSelectRoot(root.id)}
            >
              <span>{root.name}</span>
              <small>{root.kind}</small>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
