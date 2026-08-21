import type { HardState, LoreFragment } from '@glass-frontier/dto';
import { isLocationKind } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import { useChronicleStartStore } from '../../../stores/chronicleStartWizardStore';
import './WorldAtlasPage.css';

const toLine = (items: string[]) => items.join(', ');

const findLinkedEntity = async (
  entity: HardState,
  predicate: (candidate: HardState) => boolean
): Promise<HardState | null> => {
  const targetIds = entity.links.map((link) => link.targetId);
  if (targetIds.length === 0) {
    return null;
  }
  const linked = await worldAtlasClient.batchGetEntities(targetIds);
  return linked.find(predicate) ?? null;
};

/**
 * Reader over materialized canon. Canon is written by ingest batches and
 * corrected by reverting one, so nothing here edits an entity, a relationship,
 * or a lore fragment.
 */
export function WorldAtlasPage(): React.JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const initFromAtlas = useChronicleStartStore((state) => state.initFromAtlas);
  const [entity, setEntity] = useState<HardState | null>(null);
  const [entities, setEntities] = useState<HardState[]>([]);
  const [fragments, setFragments] = useState<LoreFragment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const load = useCallback(async () => {
    if (slug === undefined) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const view = await worldAtlasClient.getEntity(slug);
      setEntity(view.entity);
      setFragments(view.fragments);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load entity');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug === undefined) {
      return undefined;
    }
    let cancelled = false;
    void worldAtlasClient.getEntity(slug).then(
      (view) => {
        if (!cancelled) {
          setEntity(view.entity);
          setFragments(view.fragments);
          setError(null);
          setIsLoading(false);
        }
        return undefined;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load entity');
          setIsLoading(false);
        }
        return undefined;
      }
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void worldAtlasClient.listEntities().then(
      (list) => {
        if (!cancelled) {
          setEntities(list);
          setIsLoading(false);
        }
        return undefined;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load entities');
          setIsLoading(false);
        }
        return undefined;
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const entityLookup = useMemo(() => {
    const lookup = new Map<string, HardState>();
    for (const item of entities) {
      lookup.set(item.id, item);
    }
    return lookup;
  }, [entities]);

  const handleStartChronicle = async () => {
    if (!entity) {
      return;
    }
    setIsStarting(true);
    setError(null);
    try {
      const isLocation = isLocationKind(entity.kind);
      const [location, anchor] = await Promise.all([
        isLocation
          ? Promise.resolve(entity)
          : findLinkedEntity(entity, (candidate) => isLocationKind(candidate.kind)),
        isLocation
          ? findLinkedEntity(entity, (candidate) => !isLocationKind(candidate.kind))
          : Promise.resolve(entity),
      ]);
      if (location === null) {
        setError('Could not find a location for this entity. Please select a location entity or one linked to a location.');
        return;
      }

      initFromAtlas({
        anchor: anchor === null
          ? null
          : {
            description: anchor.description ?? undefined,
            id: anchor.id,
            kind: anchor.kind,
            name: anchor.name,
            slug: anchor.slug,
            subkind: anchor.subkind ?? undefined,
          },
        location: {
          description: location.description ?? undefined,
          id: location.id,
          name: location.name,
          slug: location.slug,
          status: location.status ?? undefined,
          subkind: location.subkind ?? undefined,
        },
      });
      void navigate('/chron/start');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare chronicle');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="atlas-page">
      <header className="atlas-header">
        <div>
          <h1>{entity?.name ?? 'World Atlas'}</h1>
          <p>Wiki-inspired view of a world entity with hard state and lore fragments.</p>
        </div>
        <div className="atlas-actions">
          <button type="button" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error ? (
        <div className="atlas-alert" role="alert">
          {error}
        </div>
      ) : null}

      {!slug ? (
        <div className="atlas-list">
          <h2>Select an entity</h2>
          <div className="atlas-list-grid">
            {entities.map((item) => (
              <button
                key={item.id}
                className="atlas-list-card"
                type="button"
                onClick={() => navigate(`/atlas/${item.slug}`)}
              >
                <p className="atlas-list-kind">{item.kind}</p>
                <p className="atlas-list-name">{item.name}</p>
                <p className="atlas-list-meta">
                  {item.subkind ? `${item.subkind} · ` : ''}
                  {item.status ?? '—'}
                </p>
                <p className="atlas-list-desc">{item.description ?? 'No description yet.'}</p>
              </button>
            ))}
          </div>
        </div>
      ) : entity ? (
        <div className="atlas-layout">
          <section className="atlas-start">
            <div>
              <h3>Start chronicle with this entity</h3>
              <p>Opens the chronicle wizard with this entity pre-selected.</p>
            </div>
            <div className="atlas-start-fields">
              <button type="button" onClick={() => void handleStartChronicle()} disabled={isStarting}>
                {isStarting ? 'Preparing…' : 'Start chronicle'}
              </button>
            </div>
          </section>
          <article className="atlas-article">
            <header className="atlas-article-head">
              <div>
                <h2>{entity.name}</h2>
                <p>
                  Kind: <strong>{entity.kind}</strong> · Subkind:{' '}
                  <strong>{entity.subkind ?? '—'}</strong> · Status:{' '}
                  <strong>{entity.status ?? '—'}</strong> · Prominence:{' '}
                  <strong>{entity.prominence}</strong>
                </p>
                {entity.description ? <p className="atlas-description">{entity.description}</p> : null}
              </div>
            </header>

            <section className="atlas-section">
              <h3>Relationships</h3>
              <div className="atlas-links">
                {(entity.links ?? []).map((link) => {
                  const target = entityLookup.get(link.targetId);
                  const targetName = target?.name ?? link.targetId;
                  const targetHref = target ? `/atlas/${target.slug}` : null;
                  return (
                    <div key={`${link.relationship}-${link.targetId}-${link.direction}`} className="atlas-link-row">
                      <div className="atlas-link-pill">{link.relationship}</div>
                      <div className="atlas-link-body">
                        <span>{link.direction === 'in' ? '←' : '→'}</span>
                        {targetHref ? (
                          <Link to={targetHref} className="atlas-link-target">
                            {targetName}
                          </Link>
                        ) : (
                          <span className="atlas-link-target">{targetName}</span>
                        )}
                        {link.strength !== undefined ? (
                          <span className="atlas-link-strength" title="Strength: 0.0 (weak/spatial) to 1.0 (strong/narrative)">
                            [{link.strength.toFixed(2)}]
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="atlas-section">
              <h3>Lore Fragments</h3>
              <div className="atlas-fragments">
                {fragments.map((fragment) => (
                  <article key={fragment.id} className="atlas-fragment">
                    <header className="atlas-fragment-head">
                      <div>
                        <h4>{fragment.title}</h4>
                        <p className="atlas-fragment-meta">{toLine(fragment.tags ?? [])}</p>
                      </div>
                    </header>
                    <p className="atlas-fragment-body">{fragment.prose}</p>
                  </article>
                ))}
              </div>
            </section>
          </article>
        </div>
      ) : (
        <div className="atlas-empty">{isLoading ? 'Loading…' : 'Entity not found.'}</div>
      )}
    </div>
  );
}
