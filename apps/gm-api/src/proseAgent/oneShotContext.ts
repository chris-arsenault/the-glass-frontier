import type { ContextSliceEntity, LiveRelationship } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import type { StoredEncyclopediaEntry } from '@glass-frontier/worldstate';

import type { EntityContextSlice, EntitySnippet, GraphContext } from '../types';
import { SEARCH_SIMILARITY_FLOOR } from './tools';

/**
 * How much of the world the one-shot writer is handed.
 *
 * The agentic path decides its own budget round by round; this one gets a
 * fixed, larger allowance because it has exactly one call to be right in. The
 * candidate ceiling is the store's own maximum.
 */
const CANDIDATE_COUNT = 50;
const OFFERED_COUNT = 14;
const LORE_PER_ENTITY = 4;
const FOCUS_ENTITY_COUNT = 4;
const FOCUS_TAG_COUNT = 5;
const VECTOR_MATCH_COUNT = 8;
const MAX_HOPS = 2;

type OneShotContext = {
  encyclopediaContext: GraphContext['encyclopediaContext'];
  entityContext: EntityContextSlice;
  relationships: LiveRelationship[];
};

const topScored = (scores: Record<string, number> | undefined, count: number): string[] =>
  Object.entries(scores ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key]) => key);

const toSnippet = (entry: ContextSliceEntity): EntitySnippet => ({
  description: entry.description,
  descriptiveIdentity: entry.descriptiveIdentity,
  facts: entry.facts,
  gmNotes: entry.gmNotes,
  id: entry.id,
  kind: entry.kind,
  loreFragments: entry.lore,
  name: entry.name,
  score: entry.score,
  slug: entry.slug,
  status: entry.status,
  subkind: entry.subkind,
  tags: entry.tags,
  unwritten: entry.unwritten,
});

/**
 * What the turn is reaching for, in the player's own words.
 *
 * The intent summary alone is a paraphrase and loses the nouns; the raw
 * message alone carries the grammar around them. Embedding both together is
 * what lets a coined or oblique name reach the entity canon files it under.
 */
const searchText = (context: GraphContext): string => [
  context.playerIntent?.intentSummary,
  context.playerMessage.content,
].filter((part): part is string => part !== undefined && part.trim().length > 0)
  .join('\n');

/**
 * The entities the turn is anchored on before anything is searched: the
 * chronicle's anchor, the place, whatever the player's
 * message resolved to, and what recent turns have been leaning on.
 */
const seedIds = (context: GraphContext, locationId: null | string): string[] => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  return [...new Set([
    anchorEntityId,
    locationId,
    ...context.targetEntityIds,
    ...topScored(entityFocus?.entityScores, FOCUS_ENTITY_COUNT),
  ].filter((id): id is string => id !== null && id !== undefined))];
};

/**
 * Canon reached by meaning rather than by graph distance.
 *
 * Traversal only ever returns what is already near the anchor, so a turn that
 * names something the chronicle has not touched yet — a material, a practice,
 * a faction two hops past the cutoff — retrieves nothing about it. The floor
 * is the measured one: invented words score 0.29–0.34 against this index and
 * must not come back as canon.
 */
const vectorMatches = async (context: GraphContext, embedding: number[]): Promise<string[]> => {
  const candidates = await context.worldSchemaStore.findEntityCandidates({
    embedding,
    limit: VECTOR_MATCH_COUNT,
  });
  return candidates
    .filter((candidate) => candidate.similarity >= SEARCH_SIMILARITY_FLOOR)
    .map((candidate) => candidate.id);
};

/**
 * Seeds first, then whatever the player's words matched, then the graph's own
 * ranking. A turn's subject outranks a well-connected bystander.
 */
const orderOffered = (
  slice: ContextSliceEntity[],
  seeds: string[],
  matched: string[]
): ContextSliceEntity[] => {
  const rank = (entry: ContextSliceEntity): number => {
    if (seeds.includes(entry.id)) {
      return 0;
    }
    return matched.includes(entry.id) ? 1 : 2;
  };
  return [...slice]
    .sort((left, right) => {
      const byRank = rank(left) - rank(right);
      return byRank === 0 ? right.score - left.score : byRank;
    })
    .slice(0, OFFERED_COUNT);
};

/**
 * A failed vector arm is not a failed turn: the graph result stands on its own
 * and this response is a comparison, never the story.
 */
const survivedVectorMatches = async (context: GraphContext, embedding: number[]): Promise<string[]> =>
  vectorMatches(context, embedding).catch((error: unknown) => {
    log('warn', 'one-shot.vector-search-failed', {
      chronicleId: context.chronicleId,
      message: error instanceof Error ? error.message : 'unknown',
      turnId: context.turnId,
    });
    return [];
  });

const encyclopediaMatches = async (
  context: GraphContext,
  location: Awaited<ReturnType<GraphContext['worldSchemaStore']['findLocationByName']>>,
  embedding: number[]
): Promise<GraphContext['encyclopediaContext']> => {
  const [semantic, applicable] = await Promise.all([
    context.encyclopediaStore.findCandidates({
      embedding,
      includeDrafts: false,
      limit: VECTOR_MATCH_COUNT,
    }),
    location === null
      ? Promise.resolve([])
      : context.encyclopediaStore.listApplicable({
        terms: location.contextTags.map((tag) => ({
          scope: 'place' as const,
          tag,
          type: 'tag' as const,
        })),
      }),
  ]);
  const semanticMatches = semantic.filter(
    (candidate) => candidate.similarity >= SEARCH_SIMILARITY_FLOOR
  );
  const semanticEntries = await Promise.all(
    semanticMatches.map((candidate) =>
      context.encyclopediaStore.getEntry({ slug: candidate.slug })
    )
  );
  return [...new Map(
    [...context.directEncyclopediaEntries, ...semanticEntries, ...applicable]
      .filter((entry): entry is StoredEncyclopediaEntry =>
        entry !== null && entry.status === 'complete' && !entry.dm
      )
      .map((entry) => [entry.slug, entry])
  ).values()].slice(0, OFFERED_COUNT);
};

const queryEmbedding = async (context: GraphContext): Promise<number[]> => {
  const query = searchText(context);
  if (query.trim().length === 0) {
    return [];
  }
  return context.embeddings.embed(query, 'query').catch((error: unknown) => {
    log('warn', 'one-shot.embedding-failed', {
      chronicleId: context.chronicleId,
      message: error instanceof Error ? error.message : 'unknown',
      turnId: context.turnId,
    });
    return [];
  });
};

const emptyOneShotContext = (
  context: GraphContext,
  focusEntities: string[],
  focusTags: string[]
): OneShotContext => ({
  encyclopediaContext: context.directEncyclopediaEntries,
  entityContext: { candidates: [], focusEntities, focusTags, offered: [], roster: [] },
  relationships: [],
});

const logOneShotContext = (
  context: GraphContext,
  counts: {
    candidates: number;
    offered: number;
    relationships: number;
    vectorMatches: number;
  }
): void => {
  log('info', 'one-shot.context', {
    candidates: counts.candidates,
    chronicleId: context.chronicleId,
    offered: counts.offered,
    relationships: counts.relationships,
    turnId: context.turnId,
    vectorMatches: counts.vectorMatches,
  });
};

const loadRelationships = (
  context: GraphContext,
  offered: ContextSliceEntity[]
): Promise<LiveRelationship[]> =>
  context.worldSchemaStore.listRelationshipsAmong({
    entityIds: offered.map((entry) => entry.id),
  });

/**
 * Retrieval for the writer that gets one call.
 *
 * Two arms into the same canon, and neither is an agent: the store walks
 * outward from the turn's anchors along strength-weighted relationships, and a
 * vector search over the player's own words reaches what the walk cannot. The
 * union is ordered, capped, and handed over whole — no rounds, no tool budget,
 * nothing for a model to decide.
 *
 */
export const buildOneShotContext = async (
  context: GraphContext
): Promise<OneShotContext> => {
  const { anchorEntityId, entityFocus } = context.chronicleState.chronicle;
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  const focusEntities = seedIds(context, location?.id ?? null);
  const focusTags = topScored(entityFocus?.tagScores, FOCUS_TAG_COUNT);
  if (focusEntities.length === 0) {
    return emptyOneShotContext(context, focusEntities, focusTags);
  }

  const embedding = await queryEmbedding(context);
  const [matched, encyclopediaContext] = embedding.length === 0
    ? [[], context.directEncyclopediaEntries]
    : await Promise.all([
      survivedVectorMatches(context, embedding),
      encyclopediaMatches(context, location, embedding),
    ]);
  const slice = await context.worldSchemaStore.getContextSlice({
    anchorId: anchorEntityId,
    focusIds: [...new Set([...focusEntities, ...matched])],
    focusTags,
    limit: CANDIDATE_COUNT,
    loreLimit: LORE_PER_ENTITY,
    maxHops: MAX_HOPS,
    minProminence: 'marginal',
  });

  const offered = orderOffered(slice, focusEntities, matched);
  const relationships = await loadRelationships(context, offered);
  logOneShotContext(context, {
    candidates: slice.length,
    offered: offered.length,
    relationships: relationships.length,
    vectorMatches: matched.length,
  });
  return {
    encyclopediaContext,
    entityContext: {
      candidates: slice.map(toSnippet),
      focusEntities,
      focusTags,
      offered: offered.map(toSnippet),
      roster: [],
    },
    relationships,
  };
};
