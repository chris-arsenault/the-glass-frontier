import type { GraphContext } from '../types';

export const encyclopediaFragment = (
  context: GraphContext
): Array<Record<string, unknown>> =>
  (context.encyclopediaContext ?? []).map((entry) => ({
    affordance: entry.usage.affordances[0],
    cue: entry.usage.cues[0],
    kind: entry.kind,
    slug: `encyclopedia:${entry.slug}`,
    subkind: entry.subkind,
    summary: entry.summary,
    title: entry.title,
  }));

export const entityReferencesFragment = (
  context: GraphContext
): Array<Record<string, unknown>> => [
  ...(context.entityReferences ?? []).map((reference) => ({
    method: reference.method,
    slug: `atlas:${reference.entitySlug}`,
    speaker: reference.speaker,
    text: reference.span?.text ?? null,
  })),
  ...context.directEncyclopediaEntries.map((entry) => ({
    kind: entry.kind,
    slug: `encyclopedia:${entry.slug}`,
    speaker: 'player',
    summary: entry.summary,
    title: entry.title,
  })),
];
