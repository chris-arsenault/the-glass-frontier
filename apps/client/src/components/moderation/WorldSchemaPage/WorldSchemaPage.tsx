import type {
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { worldSchemaClient } from '../../../lib/worldSchemaClient';
import './WorldSchemaPage.css';

type KindFormState = {
  id: string;
  displayName: string;
  category: string;
  defaultStatus: string;
  subkinds: string;
  statuses: string;
};

type RelationshipRuleForm = {
  relationshipId: string;
  srcKind: string;
  dstKind: string;
};

const toLine = (items: string[]) => items.join(', ');

export function WorldSchemaPage(): JSX.Element {
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const [schema, setSchema] = useState<WorldSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [kindForm, setKindForm] = useState<KindFormState>({
    id: '',
    displayName: '',
    category: '',
    defaultStatus: '',
    subkinds: '',
    statuses: '',
  });
  const [relationshipTypeForm, setRelationshipTypeForm] = useState<{ id: string; description: string }>({
    id: '',
    description: '',
  });
  const [ruleForm, setRuleForm] = useState<RelationshipRuleForm>({
    relationshipId: '',
    srcKind: '',
    dstKind: '',
  });

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
      return;
    }
    void loadSchema();
  }, [canModerate]);

  const handleKindSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.upsertKind({
        id: kindForm.id.trim(),
        category: kindForm.category.trim() || null,
        defaultStatus: kindForm.defaultStatus.trim() || null,
        displayName: kindForm.displayName.trim() || null,
        subkinds: kindForm.subkinds
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        statuses: kindForm.statuses
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      });
      setKindForm({
        id: '',
        displayName: '',
        category: '',
        defaultStatus: '',
        subkinds: '',
        statuses: '',
      });
      await loadSchema();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save kind');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRelationshipTypeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.addRelationshipType({
        id: relationshipTypeForm.id.trim(),
        description: relationshipTypeForm.description.trim() || null,
      });
      setRelationshipTypeForm({ id: '', description: '' });
      await loadSchema();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save relationship type');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRuleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.upsertRelationshipRule({
        relationshipId: ruleForm.relationshipId,
        srcKind: ruleForm.srcKind as never,
        dstKind: ruleForm.dstKind as never,
      });
      setRuleForm({ relationshipId: '', srcKind: '', dstKind: '' });
      await loadSchema();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save relationship rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (rule: WorldRelationshipRule) => {
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.deleteRelationshipRule(rule);
      await loadSchema();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setIsSaving(false);
    }
  };

  const sortedKinds = useMemo(() => {
    return (schema?.kinds ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  }, [schema]);
  const sortedRelationships = useMemo(() => {
    return (schema?.relationshipRules ?? []).slice().sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
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
          <p>Manage world kinds, subkinds, statuses, and the allowed relationship graph.</p>
        </div>
        <div className="ws-actions">
          <button type="button" onClick={() => void loadSchema()} disabled={isLoading}>
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
              <p>Subkinds and statuses are comma-separated lists.</p>
            </div>
          </header>
          <form className="ws-form" onSubmit={handleKindSubmit}>
            <div className="ws-field">
              <label>
                Kind ID
                <input
                  required
                  value={kindForm.id}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, id: e.target.value }))}
                  placeholder="faction"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Display name
                <input
                  value={kindForm.displayName}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Faction"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Category
                <input
                  value={kindForm.category}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="real / idea"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Default status
                <input
                  value={kindForm.defaultStatus}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, defaultStatus: e.target.value }))}
                  placeholder="active"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Subkinds (comma-separated)
                <input
                  value={kindForm.subkinds}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, subkinds: e.target.value }))}
                  placeholder="order, guild, cabal"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Statuses (comma-separated)
                <input
                  value={kindForm.statuses}
                  onChange={(e) => setKindForm((prev) => ({ ...prev, statuses: e.target.value }))}
                  placeholder="active, dormant"
                />
              </label>
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save kind'}
            </button>
          </form>
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
              <h2>Relationships</h2>
              <p>Types describe edges; rules decide which kinds can use them.</p>
            </div>
          </header>

          <form className="ws-form" onSubmit={handleRelationshipTypeSubmit}>
            <div className="ws-field">
              <label>
                Relationship ID
                <input
                  required
                  value={relationshipTypeForm.id}
                  onChange={(e) =>
                    setRelationshipTypeForm((prev) => ({
                      ...prev,
                      id: e.target.value,
                    }))
                  }
                  placeholder="ally_of"
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                Description
                <input
                  value={relationshipTypeForm.description}
                  onChange={(e) =>
                    setRelationshipTypeForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Brief description"
                />
              </label>
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save relationship type'}
            </button>
          </form>

          <form className="ws-form" onSubmit={handleRuleSubmit}>
            <div className="ws-field">
              <label>
                Relationship
                <select
                  required
                  value={ruleForm.relationshipId}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, relationshipId: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {(schema?.relationshipTypes ?? []).map((rel) => (
                    <option key={rel.id} value={rel.id}>
                      {rel.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ws-field">
              <label>
                From kind
                <select
                  required
                  value={ruleForm.srcKind}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, srcKind: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {sortedKinds.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ws-field">
              <label>
                To kind
                <select
                  required
                  value={ruleForm.dstKind}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, dstKind: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {sortedKinds.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Add rule'}
            </button>
          </form>

          <div className="ws-table">
            <div className="ws-table-head">
              <div>Relationship</div>
              <div>From</div>
              <div>To</div>
              <div>Actions</div>
            </div>
            {sortedRelationships.map((rule) => (
              <div key={`${rule.relationshipId}-${rule.srcKind}-${rule.dstKind}`} className="ws-table-row">
                <div>{rule.relationshipId}</div>
                <div>{rule.srcKind}</div>
                <div>{rule.dstKind}</div>
                <div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRule(rule)}
                    disabled={isSaving}
                    className="ws-link"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
