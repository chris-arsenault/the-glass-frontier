import {
  WorldKind as WorldKindSchema,
  WorldRelationshipRule as WorldRelationshipRuleSchema,
  type WorldRelationshipRule,
  type WorldSchema,
} from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useCanModerate } from '../../../hooks/useUserRole';
import { worldSchemaClient } from '../../../lib/worldSchemaClient';
import { useChronicleStore } from '../../../stores/chronicleStore';
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

export function WorldSchemaPage(): React.JSX.Element {
  const canModerate = useCanModerate();
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const [schema, setSchema] = useState<WorldSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [kindForm, setKindForm] = useState<KindFormState>({
    category: '',
    defaultStatus: '',
    displayName: '',
    id: '',
    statuses: '',
    subkinds: '',
  });
  const [relationshipTypeForm, setRelationshipTypeForm] = useState<{ id: string; description: string }>({
    description: '',
    id: '',
  });
  const [ruleForm, setRuleForm] = useState<RelationshipRuleForm>({
    dstKind: '',
    relationshipId: '',
    srcKind: '',
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

  const handleKindSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedKind = WorldKindSchema.safeParse({
      category: kindForm.category.trim() || undefined,
      defaultStatus: kindForm.defaultStatus.trim() || undefined,
      displayName: kindForm.displayName.trim() || undefined,
      id: kindForm.id.trim(),
      statuses: kindForm.statuses
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      subkinds: kindForm.subkinds
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
    if (!parsedKind.success) {
      setError(parsedKind.error.issues[0]?.message ?? 'Invalid world kind');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.upsertKind(parsedKind.data);
      setKindForm({
        category: '',
        defaultStatus: '',
        displayName: '',
        id: '',
        statuses: '',
        subkinds: '',
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
        description: relationshipTypeForm.description.trim() || undefined,
        id: relationshipTypeForm.id.trim(),
      });
      setRelationshipTypeForm({ description: '', id: '' });
      await loadSchema();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save relationship type');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRuleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedRule = WorldRelationshipRuleSchema.safeParse(ruleForm);
    if (!parsedRule.success) {
      setError(parsedRule.error.issues[0]?.message ?? 'Invalid relationship rule');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await worldSchemaClient.upsertRelationshipRule(parsedRule.data);
      setRuleForm({ dstKind: '', relationshipId: '', srcKind: '' });
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
