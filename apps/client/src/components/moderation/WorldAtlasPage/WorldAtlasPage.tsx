import type { HardState, HardStateLink, LoreFragment, WorldSchema } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { useCanModerate } from '../../../hooks/useUserRole';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import { worldSchemaClient } from '../../../lib/worldSchemaClient';
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
  const { slug } = useParams<{ slug: string }>();
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const [entity, setEntity] = useState<HardState | null>(null);
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
  const [linkDraft, setLinkDraft] = useState<{ relationship: string; targetId: string }>({
    relationship: '',
    targetId: '',
  });

  const load = async () => {
    if (!slug) return;
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

  const handleSaveEntity = async () => {
    if (!entity) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await worldAtlasClient.upsertEntity({
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        status: entity.status ?? null,
        subkind: entity.subkind ?? null,
        links: entity.links.map((link) => ({ relationship: link.relationship, targetId: link.targetId })),
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
      await worldAtlasClient.upsertRelationship({
        srcId: entity.id,
        dstId: linkDraft.targetId,
        relationship: linkDraft.relationship,
      });
      await load();
      setLinkDraft({ relationship: '', targetId: '' });
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

  if (!slug) {
    return <Navigate to="/" replace />;
  }

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

      {entity ? (
        <div className="atlas-layout">
          <article className="atlas-article">
            <header className="atlas-article-head">
              <div>
                <h2>{entity.name}</h2>
                <p>
                  Kind: <strong>{entity.kind}</strong> · Subkind:{' '}
                  <strong>{entity.subkind ?? '—'}</strong> · Status:{' '}
                  <strong>{entity.status ?? '—'}</strong>
                </p>
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
                {(entity.links ?? []).map((link) => (
                  <div key={`${link.relationship}-${link.targetId}-${link.direction}`} className="atlas-link-row">
                    <div className="atlas-link-pill">{link.relationship}</div>
                    <div className="atlas-link-body">
                      <span>{link.direction === 'in' ? '←' : '→'}</span>
                      <span className="atlas-link-target">{link.targetId}</span>
                    </div>
                    {canModerate ? (
                      <button type="button" className="atlas-link-action" onClick={() => void handleRemoveLink(link)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
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
