import type { ImbuedRegistryEntry } from '@glass-frontier/dto';
import { HybridObjectStore } from './hybridObjectStore';

export interface ImbuedRegistryStore {
  listEntries(): Promise<ImbuedRegistryEntry[]>;
  getEntry(key: string): Promise<ImbuedRegistryEntry | null>;
  upsertEntry(entry: ImbuedRegistryEntry): Promise<void>;
}

export class S3ImbuedRegistryStore extends HybridObjectStore implements ImbuedRegistryStore {
  async listEntries(): Promise<ImbuedRegistryEntry[]> {
    const keys = await this.list('imbued-registry/', { suffix: '.json' });
    if (!keys.length) {
      return [];
    }
    const entries: Array<ImbuedRegistryEntry | null> = await Promise.all(
      keys.map((key) => this.getJson<ImbuedRegistryEntry>(key))
    );
    return entries.filter((entry): entry is ImbuedRegistryEntry => Boolean(entry));
  }

  async getEntry(key: string): Promise<ImbuedRegistryEntry | null> {
    const sanitized = key.trim();
    if (!sanitized) {
      return null;
    }
    return this.getJson<ImbuedRegistryEntry>(this.#entryKey(sanitized));
  }

  async upsertEntry(entry: ImbuedRegistryEntry): Promise<void> {
    const normalizedKey = entry.key.trim();
    if (!normalizedKey) {
      throw new Error('Imbued registry entries require a key.');
    }
    await this.setJson(this.#entryKey(normalizedKey), { ...entry, key: normalizedKey });
  }

  #entryKey(key: string): string {
    return `imbued-registry/${key}.json`;
  }
}
