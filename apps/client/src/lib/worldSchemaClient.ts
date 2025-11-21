import type {
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';

const API_BASE = import.meta.env.VITE_WORLD_SCHEMA_API_URL ?? '/world-schema-api';

const handle = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }
  return (await response.json()) as T;
};

export const worldSchemaClient = {
  async getSchema(): Promise<WorldSchema> {
    const res = await fetch(`${API_BASE}/schema`);
    return handle<WorldSchema>(res);
  },

  async upsertKind(input: {
    id: string;
    category?: string | null;
    displayName?: string | null;
    defaultStatus?: string | null;
    subkinds?: string[];
    statuses?: string[];
  }): Promise<WorldKind> {
    const res = await fetch(`${API_BASE}/kinds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<WorldKind>(res);
  },

  async addRelationshipType(input: { id: string; description?: string | null }): Promise<WorldRelationshipType> {
    const res = await fetch(`${API_BASE}/relationship-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<WorldRelationshipType>(res);
  },

  async upsertRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    const res = await fetch(`${API_BASE}/relationship-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await handle(res);
  },

  async deleteRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    const res = await fetch(`${API_BASE}/relationship-rules`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await handle(res);
  },
};
