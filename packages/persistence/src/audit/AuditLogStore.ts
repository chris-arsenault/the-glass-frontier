import { paginateListObjectsV2 } from '@aws-sdk/client-s3';
import type { AuditLogEntry } from '@glass-frontier/dto';
import { AuditLogEntrySchema, PromptTemplateIds } from '@glass-frontier/dto';
import { Buffer } from 'node:buffer';

import { HybridObjectStore } from '../hybridObjectStore';

const RESERVED_PREFIX = '_llm-audit/';
const DEFAULT_SCAN_LIMIT = 400;
const MAX_PAGE_COUNT = 40;
const MIN_LIMIT = 5;
const MAX_LIMIT = 100;

type StoredAuditRecord = {
  createdAt?: string;
  id?: string;
  metadata?: Record<string, unknown> | null;
  nodeId?: string | null;
  playerId?: string | null;
  providerId?: string;
  request?: Record<string, unknown>;
  response?: unknown;
  requestContextId?: string | null;
};

type Candidate = {
  key: string;
  lastModified: number;
};

export type AuditLogListOptions = {
  limit?: number;
  cursor?: string;
  nodeId?: string | null;
  playerId?: string | null;
  templateId?: string | null;
  startDate?: number;
  endDate?: number;
  search?: string | null;
  excludePrefixes?: string[];
};

export type AuditLogListResult = {
  entries: AuditLogEntry[];
  nextCursor?: string;
};

type CursorPayload = {
  ts: number;
  id: string;
};

const clampLimit = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 25;
  }
  return Math.min(Math.max(Math.floor(value), MIN_LIMIT), MAX_LIMIT);
};

const decodeCursor = (input?: string): CursorPayload | null => {
  if (typeof input !== 'string' || input.length === 0) {
    return null;
  }
  try {
    const decoded = Buffer.from(input, 'base64url').toString('utf-8');
    const payload: unknown = JSON.parse(decoded);
    if (
      isRecord(payload) &&
      typeof payload.ts === 'number' &&
      Number.isFinite(payload.ts) &&
      typeof payload.id === 'string'
    ) {
      return { id: payload.id, ts: payload.ts };
    }
  } catch {
    return null;
  }
  return null;
};

const encodeCursor = (payload: CursorPayload): string => {
  const data = JSON.stringify(payload);
  return Buffer.from(data, 'utf-8').toString('base64url');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> => {
  return isRecord(value) ? value : {};
};

const TEMPLATE_ID_SET = new Set<string>(PromptTemplateIds);

export class AuditLogStore extends HybridObjectStore {
  readonly #scanLimit: number;

  constructor(options: { bucket: string; prefix?: string | null; region?: string; scanLimit?: number }) {
    super({
      bucket: options.bucket,
      prefix: options.prefix ?? null,
      region: options.region,
    });
    this.#scanLimit = options.scanLimit ?? DEFAULT_SCAN_LIMIT;
  }

  /* eslint-disable max-lines-per-function, complexity, sonarjs/cognitive-complexity */
  async listRecentEntries(options?: AuditLogListOptions): Promise<AuditLogListResult> {
    const reservedPrefixes = options?.excludePrefixes ?? [RESERVED_PREFIX];
    const limit = clampLimit(options?.limit);
    const cursor = decodeCursor(options?.cursor);
    const lowerSearch = options?.search?.trim().toLowerCase() ?? null;
    const startBoundary = typeof options?.startDate === 'number' ? options?.startDate : null;
    const endBoundary = typeof options?.endDate === 'number' ? options?.endDate : null;
    const templateFilter = this.#normalizeTemplate(options?.templateId);
    const nodeFilter = options?.nodeId?.trim() ?? null;
    const playerFilter = options?.playerId?.trim() ?? null;
    const candidates = await this.#collectRecentCandidates(reservedPrefixes);
    const entries: AuditLogEntry[] = [];

    for (const candidate of candidates) {
      // Audit replay requires sequential loading to honor cursor ordering
      // eslint-disable-next-line no-await-in-loop
      const entry = await this.#loadEntry(candidate);
      if (entry === null) {
        continue;
      }

      if (cursor !== null) {
        if (entry.createdAtMs > cursor.ts) {
          continue;
        }
        if (entry.createdAtMs === cursor.ts && entry.id >= cursor.id) {
          continue;
        }
      }

      if (startBoundary !== null && entry.createdAtMs < startBoundary) {
        continue;
      }
      if (endBoundary !== null && entry.createdAtMs > endBoundary) {
        continue;
      }
      if (nodeFilter !== null && entry.nodeId !== nodeFilter) {
        continue;
      }
      if (templateFilter !== null && entry.nodeId !== templateFilter) {
        continue;
      }
      if (playerFilter !== null && entry.playerId !== playerFilter) {
        continue;
      }
      if (lowerSearch !== null && !this.#matchesSearch(entry, lowerSearch)) {
        continue;
      }

      entries.push(entry);
      if (entries.length >= limit) {
        break;
      }
    }

    const nextCursor =
      entries.length === limit
        ? encodeCursor({ id: entries[entries.length - 1]?.id ?? '', ts: entries[entries.length - 1]?.createdAtMs ?? 0 })
        : undefined;

    return { entries, nextCursor };
  }
  /* eslint-enable max-lines-per-function, complexity, sonarjs/cognitive-complexity */

  async getEntry(storageKey: string): Promise<AuditLogEntry | null> {
    const record = await this.getJson<StoredAuditRecord>(storageKey);
    if (record === null) {
      return null;
    }
    return this.#toEntry(record, storageKey, Date.now());
  }

  /* eslint-disable complexity */
  async #collectRecentCandidates(reservedPrefixes: string[]): Promise<Candidate[]> {
    const prefix = this.buildKey('');
    const paginator = paginateListObjectsV2(
      { client: this.client },
      {
        Bucket: this.bucket,
        Prefix: prefix.length > 0 ? prefix : undefined,
      }
    );

    const candidates: Candidate[] = [];
    let pagesScanned = 0;
    for await (const page of paginator) {
      pagesScanned += 1;
      const contents = page.Contents ?? [];
      for (const object of contents) {
        const key = object.Key ?? null;
        if (key === null) {
          continue;
        }
        const relativeKey = this.stripPrefix(key);
        if (!relativeKey.endsWith('.json')) {
          continue;
        }
        if (reservedPrefixes.some((prefixCandidate) => relativeKey.startsWith(prefixCandidate))) {
          continue;
        }
        const modified = object.LastModified?.getTime() ?? 0;
        candidates.push({ key: relativeKey, lastModified: modified });
      }
      const isTruncated = page.IsTruncated === true;
      if (!isTruncated || candidates.length >= this.#scanLimit || pagesScanned >= MAX_PAGE_COUNT) {
        break;
      }
    }

    candidates.sort((a, b) => b.lastModified - a.lastModified);
    return candidates.slice(0, this.#scanLimit);
  }
  /* eslint-enable complexity */

  async #loadEntry(candidate: Candidate): Promise<AuditLogEntry | null> {
    const record = await this.getJson<StoredAuditRecord>(candidate.key);
    if (record === null) {
      return null;
    }
    return this.#toEntry(record, candidate.key, candidate.lastModified);
  }

  /* eslint-disable-next-line complexity */
  #toEntry(record: StoredAuditRecord, key: string, fallbackTimestamp: number): AuditLogEntry | null {
    const id = typeof record.id === 'string' ? record.id : null;
    if (id === null) {
      return null;
    }
    const iso = typeof record.createdAt === 'string' ? record.createdAt : null;
    const fallbackMs = Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : Date.now();
    const createdAt = iso ?? new Date(fallbackMs).toISOString();
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) {
      return null;
    }
    const metadata = isRecord(record.metadata) ? record.metadata : undefined;
    const entry: AuditLogEntry = {
      createdAt,
      createdAtMs,
      id,
      metadata,
      nodeId: typeof record.nodeId === 'string' ? record.nodeId : null,
      playerId: typeof record.playerId === 'string' ? record.playerId : null,
      providerId: typeof record.providerId === 'string' ? record.providerId : 'unknown',
      request: toRecord(record.request),
      requestContextId: typeof record.requestContextId === 'string' ? record.requestContextId : null,
      response: record.response ?? null,
      storageKey: key,
    };
    const parsed = AuditLogEntrySchema.safeParse(entry);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  #matchesSearch(entry: AuditLogEntry, needle: string): boolean {
    const haystacks = [
      entry.playerId ?? '',
      entry.requestContextId ?? '',
      entry.nodeId ?? '',
      JSON.stringify(entry.metadata ?? {}),
      JSON.stringify(entry.request),
      typeof entry.response === 'string' ? entry.response : JSON.stringify(entry.response ?? {}),
    ];
    return haystacks.some((value) => value.toLowerCase().includes(needle));
  }

  #normalizeTemplate(templateId?: string | null): string | null {
    if (typeof templateId !== 'string') {
      return null;
    }
    const trimmed = templateId.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return TEMPLATE_ID_SET.has(trimmed) ? trimmed : null;
  }
}
