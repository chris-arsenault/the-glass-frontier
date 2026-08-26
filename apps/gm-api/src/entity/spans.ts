import type { EntityReferenceSpan } from '@glass-frontier/dto';

const escapePattern = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The first whole-word occurrence of a term, or null. Shared by the player
 * reference resolver and the deterministic GM annotation so both agree on what
 * counts as a mention.
 */
export const findSpan = (content: string, term: string): EntityReferenceSpan | null => {
  const normalized = term.trim();
  if (normalized.length === 0) {
    return null;
  }
  const match = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapePattern(normalized)})(?=$|[^\\p{L}\\p{N}])`, 'iu'
  ).exec(content);
  if (match === null || match.index === undefined || match[2] === undefined) {
    return null;
  }
  const start = match.index + (match[1]?.length ?? 0);
  return { end: start + match[2].length, start, text: match[2] };
};
