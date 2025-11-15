import type {
  LocationBreadcrumbEntry,
  LocationEdgeKind as LocationEdgeKindType,
  LocationGraphSnapshot,
  LocationPlace,
} from '@glass-frontier/dto';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import type { FormEvent } from 'react';
import React, { useMemo, useState } from 'react';

import { EDGE_KIND_OPTIONS } from './locationUtils';

type RelationshipDialogProps = {
  graph: LocationGraphSnapshot | null;
  isMutating: boolean;
  onAdd: (input: { kind: LocationEdgeKindType; targetId: string }) => Promise<void>;
  onClose: () => void;
  onRemove: (input: { kind: LocationEdgeKindType; targetId: string }) => Promise<void>;
  onSelectPlace: (placeId: string) => Promise<void>;
  open: boolean;
  placeId: string | null;
  placeMap: Map<string, LocationPlace>;
  selectedDetail: { breadcrumb: LocationBreadcrumbEntry[]; place: LocationPlace } | null;
};

export const RelationshipDialog = ({
  graph,
  isMutating,
  onAdd,
  onClose,
  onRemove,
  onSelectPlace,
  open,
  placeId,
  placeMap,
  selectedDetail,
}: RelationshipDialogProps) => {
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<LocationEdgeKindType>(EDGE_KIND_OPTIONS[0]);

  const outgoing = useMemo(() => {
    if (!graph || !placeId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.src === placeId);
  }, [graph, placeId]);

  const incoming = useMemo(() => {
    if (!graph || !placeId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.dst === placeId);
  }, [graph, placeId]);

  const availableTargets = useMemo(() => {
    return Array.from(placeMap.values())
      .filter((place) => place.id !== placeId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [placeId, placeMap]);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetId) {
      return;
    }
    await onAdd({ kind, targetId });
    setTargetId('');
  };

  const breadcrumb =
    selectedDetail && placeId && selectedDetail.place.id === placeId
      ? selectedDetail.breadcrumb.map((entry) => entry.name).join(' · ')
      : placeId
        ? placeMap.get(placeId)?.name ?? 'Selected location'
        : null;

  const handleDialogClose = () => {
    setTargetId('');
    setKind(EDGE_KIND_OPTIONS[0]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="md">
      <DialogTitle>Manage relationships</DialogTitle>
      <DialogContent className="lm-dialog-content">
        <p className="lm-dialog-meta">{breadcrumb ?? 'Select a location from the grid.'}</p>
        <div className="lm-relationship-grid">
          <div>
            <h3>Outgoing</h3>
            {outgoing.length === 0 ? (
              <p className="lm-empty">No outgoing edges.</p>
            ) : (
              <ul className="lm-edge-list">
                {outgoing.map((edge) => (
                  <li key={`${edge.src}-${edge.kind}-${edge.dst}`}>
                    <button type="button" onClick={() => onSelectPlace(edge.dst)}>
                      {placeMap.get(edge.dst)?.name ?? edge.dst}
                    </button>
                    <span className="lm-chip">{edge.kind}</span>
                    <button
                      type="button"
                      className="lm-remove"
                      onClick={() => onRemove({ kind: edge.kind, targetId: edge.dst })}
                      disabled={isMutating}
                      title="Remove relationship"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Incoming</h3>
            {incoming.length === 0 ? (
              <p className="lm-empty">No incoming edges.</p>
            ) : (
              <ul className="lm-edge-list">
                {incoming.map((edge) => (
                  <li key={`${edge.src}-${edge.kind}-${edge.dst}`}>
                    <button type="button" onClick={() => onSelectPlace(edge.src)}>
                      {placeMap.get(edge.src)?.name ?? edge.src}
                    </button>
                    <span className="lm-chip">{edge.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <form className="lm-relationship-form" onSubmit={handleAdd}>
          <h3>Add relationship</h3>
          <label>
            Target location
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select a location</option>
              {availableTargets.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relationship type
            <select value={kind} onChange={(event) => setKind(event.target.value as LocationEdgeKindType)}>
              {EDGE_KIND_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!targetId || isMutating} variant="contained">
            {isMutating ? 'Saving…' : 'Add relationship'}
          </Button>
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDialogClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
