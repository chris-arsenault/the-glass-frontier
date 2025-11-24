import type { HardState, HardStateLink, LoreFragment, WorldSchema } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useCanModerate } from '../../../hooks/useUserRole';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import { worldSchemaClient } from '../../../lib/worldSchemaClient';
import { useChronicleStartStore } from '../../../stores/chronicleStartWizardStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './WorldAtlasPage.css';

type FragmentDraft = {
  id?: string;
  title: string;
  prose: string;
  tags: string;
};

const toLine = (items: string[]) => items.join(', ');

export function WorldAtlasPage(): JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const initFromAtlas = useChronicleStartStore((state) => state.initFromAtlas);
  const [entity, setEntity] = useState<HardState | null>(null);
  const [entities, setEntities] = useState<HardState[]>([]);
  const [fragments, setFragments] = useState<LoreFragment[]>([]);
  const [schema, setSchema] = useState<WorldSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fragmentDraft, setFragmentDraft] = useState<FragmentDraft>({
    title: '',
    prose: '',
    tags: '',
  });
  const [linkDraft, setLinkDraft] = useState<{ relationship: string; targetId: string; strength: string }>({
    relationship: '',
    targetId: '',
    strength: '',
  });

  const load = async () => {
    if (!slug) {
      setError(null);
      setEntity(null);
      setFragments([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [details, schemaResult] = await Promise.all([
        worldAtlasClient.getEntity(slug),
        worldSchemaClient.getSchema(),
      ]);
      setEntity(details.entity);
      setFragments(details.fragments);
      setSchema(schemaResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load entity');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [slug]);

  useEffect(() => {
    if (entities.length > 0 || isLoading || schema) {
      return;
    }
    setIsLoading(true);
    void worldAtlasClient
      .listEntities()
      .then((list) => {
        setEntities(list);
        if (!schema) {
          void worldSchemaClient.getSchema().then(setSchema).catch(() => {});
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load entities'))
      .finally(() => setIsLoading(false));
  }, [entities.length, isLoading, schema]);

  const statusOptions = useMemo(() => {
    if (!entity || !schema) return [];
    const kind = schema.kinds.find((k) => k.id === entity.kind);
    return kind?.statuses ?? [];
  }, [entity, schema]);

  const subkindOptions = useMemo(() => {
    if (!entity || !schema) return [];
    const kind = schema.kinds.find((k) => k.id === entity.kind);
    return kind?.subkinds ?? [];
  }, [entity, schema]);

  const relationshipOptions = useMemo(() => schema?.relationshipTypes ?? [], [schema]);
  const entityLookup = useMemo(() => {
    const lookup = new Map<string, HardState>();
    for (const item of entities) {
      lookup.set(item.id, item);
    }
    return lookup;
  }, [entities]);

  const handleSaveEntity = async () => {
    if (!entity) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await worldAtlasClient.upsertEntity({
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        description: entity.description ?? null,
        status: entity.status ?? null,
        subkind: entity.subkind ?? null,
        links: entity.links.map((link) => ({
          relationship: link.relationship,
          targetId: link.targetId,
          strength: link.strength,
        })),
      });
      setEntity(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entity');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!entity) return;
    setIsSaving(true);
    setError(null);
    try {
      const strength = linkDraft.strength.trim() ? parseFloat(linkDraft.strength) : undefined;
      await worldAtlasClient.upsertRelationship({
        srcId: entity.id,
        dstId: linkDraft.targetId,
        relationship: linkDraft.relationship,
        strength: strength !== undefined && !isNaN(strength) ? strength : undefined,
      });
      await load();
      setLinkDraft({ relationship: '', targetId: '', strength: '' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveLink = async (link: HardStateLink) => {
    if (!entity) return;
    setIsSaving(true);
    setError(null);
    try {
      const srcId = link.direction === 'out' ? entity.id : link.targetId;
      const dstId = link.direction === 'out' ? link.targetId : entity.id;
      await worldAtlasClient.deleteRelationship({
        srcId,
        dstId,
        relationship: link.relationship,
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFragment = async () => {
    if (!entity) return;
    setIsSaving(true);
    setError(null);
    try {
      const tags = fragmentDraft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const saved = fragmentDraft.id
        ? await worldAtlasClient.updateFragment({
            id: fragmentDraft.id,
            title: fragmentDraft.title,
            prose: fragmentDraft.prose,
            tags,
          })
        : await worldAtlasClient.createFragment({
            entityId: entity.id,
            title: fragmentDraft.title,
            prose: fragmentDraft.prose,
            tags,
            chronicleId: chronicleId ?? entity.id,
          });
      setFragmentDraft({ id: undefined, title: '', prose: '', tags: '' });
      setFragments((prev) => {
        const next = prev.filter((f) => f.id !== saved.id);
        return [...next, saved];
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save fragment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFragment = async (id: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await worldAtlasClient.deleteFragment(id);
      setFragments((prev) => prev.filter((f) => f.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete fragment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartChronicle = async () => {
    if (!entity) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      let location: HardState | null = null;
      let anchor: HardState | null = null;

      if (entity.kind === 'location') {
        // Entity is a location - use it as location, find anchor from neighbors
        location = entity;
        // Try to find a non-location neighbor to use as anchor
        if (entity.links && entity.links.length > 0) {
          for (const link of entity.links) {
            const neighborResult = await worldAtlasClient.getEntity(link.targetId);
            if (neighborResult && neighborResult.entity.kind !== 'location') {
              anchor = neighborResult.entity;
              break;
            }
          }
        }
      } else {
        // Entity is not a location - use it as anchor, find location from neighbors
        anchor = entity;
        // Try to find a location neighbor
        if (entity.links && entity.links.length > 0) {
          for (const link of entity.links) {
            const neighborResult = await worldAtlasClient.getEntity(link.targetId);
            if (neighborResult && neighborResult.entity.kind === 'location') {
              location = neighborResult.entity;
              break;
            }
          }
        }
      }

      if (!location) {
        setError('Could not find a location for this entity. Please select a location entity or one linked to a location.');
        return;
      }

      console.log('[WorldAtlas] Starting chronicle with:', {
        location: { id: location.id, name: location.name },
        anchor: anchor ? { id: anchor.id, name: anchor.name } : null,
      });

      initFromAtlas({
        anchor: anchor
          ? {
              description: anchor.description ?? undefined,
              id: anchor.id,
              kind: anchor.kind,
              name: anchor.name,
              slug: anchor.slug,
              subkind: anchor.subkind ?? undefined,
            }
          : null,
        location: {
          description: location.description ?? undefined,
          id: location.id,
          name: location.name,
          slug: location.slug,
          status: location.status ?? undefined,
          subkind: location.subkind ?? undefined,
        },
      });
      navigate('/chronicles/start');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare chronicle');
    } finally {
      setIsSaving(false);
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
          {canModerate ? (
            <button type="button" onClick={() => void handleSaveEntity()} disabled={isSaving || !entity}>
              {isSaving ? 'Saving…' : 'Save entity'}
            </button>
          ) : null}
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
              <button type="button" onClick={() => void handleStartChronicle()} disabled={isSaving}>
                {isSaving ? 'Preparing…' : 'Start chronicle'}
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
                  <strong>{entity.status ?? '—'}</strong>
                </p>
                {entity.description ? <p className="atlas-description">{entity.description}</p> : null}
              </div>
            </header>

            <section className="atlas-section">
              <h3>Hard State</h3>
              <div className="atlas-fields">
                <label>
                  Name
                  <input
                    value={entity.name}
                    disabled={!canModerate}
                    onChange={(e) => setEntity({ ...entity, name: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={entity.description ?? ''}
                    disabled={!canModerate}
                    onChange={(e) => setEntity({ ...entity, description: e.target.value || undefined })}
                    rows={3}
                    placeholder="Short textarea for entity description"
                  />
                </label>
                <label>
                  Subkind
                  <select
                    disabled={!canModerate}
                    value={entity.subkind ?? ''}
                    onChange={(e) => setEntity({ ...entity, subkind: e.target.value || undefined })}
                  >
                    <option value="">Unspecified</option>
                    {subkindOptions.map((subkind) => (
                      <option key={subkind} value={subkind}>
                        {subkind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    disabled={!canModerate}
                    value={entity.status ?? ''}
                    onChange={(e) => setEntity({ ...entity, status: e.target.value || undefined })}
                  >
                    <option value="">Unspecified</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

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
                      {canModerate ? (
                        <button type="button" className="atlas-link-action" onClick={() => void handleRemoveLink(link)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {canModerate ? (
                <div className="atlas-add-link">
                  <select
                    value={linkDraft.relationship}
                    onChange={(e) => setLinkDraft((prev) => ({ ...prev, relationship: e.target.value }))}
                  >
                    <option value="">Relationship</option>
                    {relationshipOptions.map((rel) => (
                      <option key={rel.id} value={rel.id}>
                        {rel.id}
                      </option>
                    ))}
                  </select>
                  <input
                    value={linkDraft.targetId}
                    onChange={(e) => setLinkDraft((prev) => ({ ...prev, targetId: e.target.value }))}
                    placeholder="Target entity id"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={linkDraft.strength}
                    onChange={(e) => setLinkDraft((prev) => ({ ...prev, strength: e.target.value }))}
                    placeholder="Strength (0-1)"
                    title="0.0 = weak/spatial, 1.0 = strong/narrative"
                  />
                  <button type="button" onClick={() => void handleAddLink()} disabled={!linkDraft.relationship || !linkDraft.targetId || isSaving}>
                    Add link
                  </button>
                </div>
              ) : null}
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
                      {canModerate ? (
                        <div className="atlas-fragment-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setFragmentDraft({
                                id: fragment.id,
                                title: fragment.title,
                                prose: fragment.prose,
                                tags: fragment.tags.join(', '),
                              })
                            }
                          >
                            Edit
                          </button>
                          <button type="button" onClick={() => void handleDeleteFragment(fragment.id)}>
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </header>
                    <p className="atlas-fragment-body">{fragment.prose}</p>
                  </article>
                ))}
              </div>
              {canModerate ? (
                <div className="atlas-fragment-form">
                  <label>
                    Title
                    <input
                      value={fragmentDraft.title}
                      onChange={(e) => setFragmentDraft((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </label>
                  <label>
                    Tags (comma-separated)
                    <input
                      value={fragmentDraft.tags}
                      onChange={(e) => setFragmentDraft((prev) => ({ ...prev, tags: e.target.value }))}
                    />
                  </label>
                  <label>
                    Prose
                    <textarea
                      rows={6}
                      value={fragmentDraft.prose}
                      onChange={(e) => setFragmentDraft((prev) => ({ ...prev, prose: e.target.value }))}
                    />
                  </label>
                  <button type="button" onClick={() => void handleSaveFragment()} disabled={isSaving || !fragmentDraft.title || !fragmentDraft.prose}>
                    {fragmentDraft.id ? 'Update fragment' : 'Add fragment'}
                  </button>
                </div>
              ) : null}
            </section>
          </article>
        </div>
      ) : (
        <div className="atlas-empty">{isLoading ? 'Loading…' : 'Entity not found.'}</div>
      )}
    </div>
  );
}
