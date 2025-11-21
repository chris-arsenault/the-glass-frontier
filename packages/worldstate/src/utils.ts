import { randomUUID } from 'node:crypto';

export const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeTags = (tags?: string[] | null, limit = 16): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const candidate = raw.trim().toLowerCase();
    if (candidate.length === 0 || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    result.push(candidate);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
};

export const slugify = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (normalized.length >= 3) {
    return normalized.slice(0, 64);
  }
  return `loc_${randomUUID()}`;
};

export const toSnakeCase = (value: string): string => {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');
};

export const now = (): number => Date.now();
