import { type WorldSchema } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useCanModerate } from '../../../hooks/useUserRole';
import { worldSchemaClient } from '../../../lib/worldSchemaClient';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './WorldSchemaPage.css';

const toLine = (items: string[]) => items.join(', ');

/**
 * Read-only view of the world vocabulary. The vocabulary is versioned content in
 * `@glass-frontier/dto`; changing it means editing that artifact and redeploying,
 * so this page reports what the world currently accepts rather than editing it.
 */
export function WorldSchemaPage(): React.JSX.Element {
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const [schema, setSchema] = useState<WorldSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSchema = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await worldSchemaClient.getSchema();
      setSchema(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load schema');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canModerate) {
      return undefined;
    }
    let cancelled = false;
    void worldSchemaClient.getSchema().then(
      (next) => {
        if (!cancelled) {
          setSchema(next);
          setError(null);
          setIsLoading(false);
        }
        return undefined;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load schema');
          setIsLoading(false);
        }
        return undefined;
      }
    );
    return () => {
      cancelled = true;
    };
  }, [canModerate]);

  const sortedKinds = useMemo(() => {
    return (schema?.kinds ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  }, [schema]);
  const sortedRelationshipTypes = useMemo(() => {
    return (schema?.relationshipTypes ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  }, [schema]);
  const sortedRules = useMemo(() => {
    return (schema?.relationshipRules ?? [])
      .slice()
      .sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
  }, [schema]);

  if (!canModerate) {
    const redirectTarget = chronicleId ? `/chron/${chronicleId}` : '/';
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="ws-page">
      <header className="ws-header">
        <div>
          <h1>World Schema</h1>
          <p>
            The kinds, subkinds, statuses, and relationship rules this world accepts. Defined in
            the world vocabulary and applied on deploy.
          </p>
        </div>
        <div className="ws-actions">
          <button type="button" className="ws-refresh" onClick={() => void loadSchema()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error ? (
        <div className="ws-alert" role="alert">
          {error}
        </div>
      ) : null}
      <div className="ws-grid">
        <section className="ws-card">
          <header className="ws-card-header">
            <div>
              <h2>Kinds</h2>
              <p>{sortedKinds.length} kinds define what an entity can be.</p>
            </div>
          </header>
          <div className="ws-table">
            <div className="ws-table-head">
              <div>Kind</div>
              <div>Category</div>
              <div>Statuses</div>
              <div>Subkinds</div>
              <div>Default</div>
            </div>
            {sortedKinds.map((kind) => (
              <div key={kind.id} className="ws-table-row">
                <div className="ws-kind-id">{kind.id}</div>
                <div>{kind.category ?? '—'}</div>
                <div>{toLine(kind.statuses)}</div>
                <div>{toLine(kind.subkinds)}</div>
                <div>{kind.defaultStatus ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="ws-card">
          <header className="ws-card-header">
            <div>
              <h2>Relationship types</h2>
              <p>
                Default strength is the weight traversal uses when an edge carries none. Banned
                verbs are not listed.
              </p>
            </div>
          </header>
          <div className="ws-table">
            <div className="ws-table-head">
              <div>Relationship</div>
              <div>Category</div>
              <div>Strength</div>
              <div>Description</div>
            </div>
            {sortedRelationshipTypes.map((type) => (
              <div key={type.id} className="ws-table-row">
                <div className="ws-kind-id">{type.id}</div>
                <div>{type.category}</div>
                <div>{type.defaultStrength.toFixed(2)}</div>
                <div>{type.description ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="ws-card">
          <header className="ws-card-header">
            <div>
              <h2>Relationship rules</h2>
              <p>{sortedRules.length} rules decide which kinds a verb may connect.</p>
            </div>
          </header>
          <div className="ws-table">
            <div className="ws-table-head">
              <div>Relationship</div>
              <div>From</div>
              <div>To</div>
            </div>
            {sortedRules.map((rule) => (
              <div
                key={`${rule.relationshipId}-${rule.srcKind}-${rule.dstKind}`}
                className="ws-table-row"
              >
                <div>{rule.relationshipId}</div>
                <div>{rule.srcKind}</div>
                <div>{rule.dstKind}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
