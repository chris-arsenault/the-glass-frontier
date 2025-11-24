import type { HardState, LoreFragment } from '@glass-frontier/dto';

const API_BASE = import.meta.env.VITE_ATLAS_API_URL ?? '/atlas-api';

const handle = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }
  return (await response.json()) as T;
};

export const worldAtlasClient = {
  async listEntities(kind?: string): Promise<HardState[]> {
    const url = new URL(`${API_BASE}/entities`, window.location.origin);
    if (kind) {
      url.searchParams.set('kind', kind);
    }
    const res = await fetch(url.toString());
    return handle<HardState[]>(res);
  },

  async getEntity(idOrSlug: string): Promise<{ entity: HardState; fragments: LoreFragment[] }> {
    const res = await fetch(`${API_BASE}/entities/${idOrSlug}`);
    return handle(res);
  },

  async upsertEntity(input: {
    id?: string;
    kind: string;
    subkind?: string | null;
    name: string;
    description?: string | null;
    status?: string | null;
    prominence?: string | null;
    links?: Array<{ relationship: string; targetId: string; strength?: number }>;
  }): Promise<HardState> {
    const res = await fetch(`${API_BASE}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<HardState>(res);
  },

  async upsertRelationship(input: { srcId: string; dstId: string; relationship: string; strength?: number | null }): Promise<void> {
    const res = await fetch(`${API_BASE}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await handle(res);
  },

  async deleteRelationship(input: { srcId: string; dstId: string; relationship: string }): Promise<void> {
    const res = await fetch(`${API_BASE}/relationships`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    await handle(res);
  },

  async createFragment(input: {
    entityId: string;
    title: string;
    prose: string;
    chronicleId?: string;
    beatId?: string;
    tags?: string[];
  }): Promise<LoreFragment> {
    const res = await fetch(`${API_BASE}/fragments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<LoreFragment>(res);
  },

  async updateFragment(input: {
    id: string;
    title?: string;
    prose?: string;
    tags?: string[];
    chronicleId?: string;
    beatId?: string;
  }): Promise<LoreFragment> {
    const res = await fetch(`${API_BASE}/fragments/${input.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handle<LoreFragment>(res);
  },

  async deleteFragment(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/fragments/${id}`, { method: 'DELETE' });
    await handle(res);
  },
};
