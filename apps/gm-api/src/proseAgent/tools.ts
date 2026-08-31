import { renderBlock } from '@glass-frontier/app';
import type { HardState, WorldReferenceSlug } from '@glass-frontier/dto';
import { type ToolSet, tool } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import { recordedPlayerMessage } from '../prompts/contextFormaters';
import type { GraphContext } from '../types';
import type { ToolSession } from './toolSession';

const MAX_OPEN_LORE = 6;
const MAX_SEARCH_RESULTS = 8;
const EXCERPT_LENGTH = 240;

/** The measured Cohere Embed v4 floor shared with one-shot Atlas retrieval. */
export const SEARCH_SIMILARITY_FLOOR = 0.32;

const INVENTION_POLICY =
  'A miss does not prove that something cannot exist. If the player coined the name and '
  + 'history does not contain it, treat it as new fiction rather than established canon.';

class RetrievalMissError extends Error {}

type ToolDeps = {
  context: GraphContext;
  session: ToolSession;
};

type AgentTool = ToolSet[string];

type RankedSearchResult = {
  excerpt: string;
  kind: string;
  rank: number;
  slug: WorldReferenceSlug;
  title: string;
};

const excerpt = (text: string | undefined): string => {
  const compact = text?.replace(/\s+/gu, ' ').trim() ?? '';
  return compact.length <= EXCERPT_LENGTH
    ? compact
    : `${compact.slice(0, EXCERPT_LENGTH - 1)}…`;
};

const renderTurn = (turn: GraphContext['chronicleState']['turns'][number]): unknown => ({
  gm: turn.gmSummary ?? turn.gmResponse?.content,
  player: recordedPlayerMessage(
    turn.playerMessage.content,
    turn.playerIntent?.intentSummary
  ),
  sequence: turn.turnSequence,
  slug: `chronicle:turn-${turn.turnSequence}`,
});

const visibleAtlas = async (
  context: GraphContext,
  slug: string
): Promise<HardState | null> => {
  const entity = await context.worldSchemaStore.getEntityBySlug({ slug });
  return entity === null || entity.dm ? null : entity;
};

const rankedAtlasEntity = (
  entity: HardState,
  rank: number,
  excerptText: string | undefined
): RankedSearchResult => ({
  excerpt: excerpt(excerptText),
  kind: entity.kind,
  rank,
  slug: `atlas:${entity.slug}`,
  title: entity.name,
});

const atlasSearchResults = async (
  context: GraphContext,
  query: string,
  embedding: number[]
): Promise<RankedSearchResult[]> => {
  const [semantic, exact, lore] = await Promise.all([
    embedding.length === 0
      ? Promise.resolve([])
      : context.worldSchemaStore.findEntityCandidates({ embedding, limit: MAX_SEARCH_RESULTS }),
    context.worldSchemaStore.findEntitiesByName({ name: query }),
    context.worldSchemaStore.searchLoreFragments({ limit: 5, query }),
  ]);
  const semanticMatches = semantic.filter(
    (candidate) => candidate.similarity >= SEARCH_SIMILARITY_FLOOR
  );
  const ids = [...new Set([
    ...semanticMatches.map((candidate) => candidate.id),
    ...exact.map((entity) => entity.id),
    ...lore.map((fragment) => fragment.entityId),
  ])];
  const entities = await context.worldSchemaStore.listEntitiesByIds(ids);
  const byId = new Map(entities.filter((entity) => !entity.dm).map((entity) => [entity.id, entity]));
  return [
    ...semanticMatches.flatMap((candidate) => {
      const entity = byId.get(candidate.id);
      return entity === undefined
        ? []
        : [rankedAtlasEntity(entity, candidate.similarity, entity.description)];
    }),
    ...exact
      .filter((entity) => !entity.dm)
      .map((entity) => rankedAtlasEntity(entity, 2, entity.description)),
    ...lore.flatMap((fragment) => {
      const entity = byId.get(fragment.entityId);
      return entity === undefined ? [] : [rankedAtlasEntity(entity, 1.5, fragment.prose)];
    }),
  ];
};

const encyclopediaSearchResults = async (
  context: GraphContext,
  query: string,
  embedding: number[]
): Promise<RankedSearchResult[]> => {
  const [semantic, lexical] = await Promise.all([
    embedding.length === 0
      ? Promise.resolve([])
      : context.encyclopediaStore.findCandidates({ embedding, limit: MAX_SEARCH_RESULTS }),
    context.encyclopediaStore.listEntries({ limit: MAX_SEARCH_RESULTS, query }),
  ]);
  return [
    ...semantic
      .filter((candidate) => candidate.similarity >= SEARCH_SIMILARITY_FLOOR)
      .map((candidate) => ({
        excerpt: excerpt(candidate.summary),
        kind: candidate.kind,
        rank: candidate.similarity,
        slug: candidate.slug,
        title: candidate.title,
      })),
    ...lexical.map((entry) => ({
      excerpt: excerpt(entry.summary),
      kind: entry.kind,
      rank: 1.8,
      slug: `encyclopedia:${entry.slug}`,
      title: entry.title,
    })),
  ];
};

const chronicleSearchResults = async (
  context: GraphContext,
  query: string
): Promise<RankedSearchResult[]> => {
  const turns = await context.chronicleStore.searchTurns({
    chronicleId: context.chronicleId,
    limit: 5,
    query,
  });
  return turns.map((turn) => ({
    excerpt: excerpt([
      turn.playerMessage.content,
      turn.gmSummary ?? turn.gmResponse?.content,
    ].filter((part): part is string => part !== undefined).join(' ')),
    kind: 'chronicle_turn',
    rank: 1.4,
    slug: `chronicle:turn-${turn.turnSequence}`,
    title: `Turn ${turn.turnSequence}`,
  }));
};

const compareRankedResults = (left: RankedSearchResult, right: RankedSearchResult): number => {
  const rankOrder = right.rank - left.rank;
  return rankOrder !== 0 ? rankOrder : left.title.localeCompare(right.title);
};

const searchTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Search the Atlas, Encyclopedia, and this Chronicle together by name or meaning. '
    + 'Every result has one fully qualified slug; copy that slug directly into open. '
    + 'Results contain no database ids and need no source field or string construction.',
  execute: async ({ query }: { query: string }) => {
    const embedding = await context.embeddings.embed(query, 'query').catch((error: unknown) => {
      log('warn', 'prose-agent.search-embedding-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return [];
    });
    const resultGroups = await Promise.all([
      atlasSearchResults(context, query, embedding),
      encyclopediaSearchResults(context, query, embedding),
      chronicleSearchResults(context, query),
    ]);
    const unique = new Map<string, RankedSearchResult>();
    for (const result of resultGroups.flat()) {
      const previous = unique.get(result.slug);
      if (previous === undefined || result.rank > previous.rank) {unique.set(result.slug, result);}
    }
    const matches = [...unique.values()]
      .sort(compareRankedResults)
      .slice(0, MAX_SEARCH_RESULTS);
    if (matches.length === 0) {
      throw new RetrievalMissError(`Nothing matches "${query}". ${INVENTION_POLICY}`);
    }
    return session.wrapResult(`search:${query}`, () => renderBlock(
      matches.map(({ rank: _rank, ...result }) => result)
    ));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const atlasRelationships = (
  entity: HardState,
  targetsById: Map<string, HardState>
): Array<Record<string, unknown>> =>
  entity.links.flatMap((link) => {
    const target = targetsById.get(link.targetId);
    return target === undefined ? [] : [{
      direction: link.direction,
      identity: link.descriptiveIdentity ?? {},
      slug: `atlas:${target.slug}`,
      title: target.name,
      verb: link.relationship,
    }];
  });

const openAtlas = async (
  context: GraphContext,
  session: ToolSession,
  slug: string
): Promise<string | null> => {
  const entity = await visibleAtlas(context, slug);
  if (entity === null) {return null;}
  const targetIds = [...new Set(entity.links
    .filter((link) => link.live !== false)
    .map((link) => link.targetId))];
  const [lore, targets, classifications] = await Promise.all([
    context.worldSchemaStore.listLoreFragmentsByEntity({
      entityId: entity.id,
      limit: MAX_OPEN_LORE,
    }),
    context.worldSchemaStore.listEntitiesByIds(targetIds),
    context.encyclopediaStore.listClassificationsForEntity(entity.id),
  ]);
  const targetsById = new Map(targets.filter((target) => !target.dm).map((target) => [target.id, target]));
  session.recordServedReference({
    atlasEntityId: entity.id,
    atlasSlug: entity.slug,
    slug: `atlas:${entity.slug}`,
  });
  return renderBlock({
    classifications: classifications.map((classification) => ({
      role: classification.role,
      slug: classification.encyclopediaSlug,
      title: classification.encyclopediaTitle,
    })),
    description: entity.description,
    facts: entity.facts,
    gmNotes: (entity.gmNotes ?? []).map((note) => `${note.kind}: ${note.text}`),
    identity: entity.descriptiveIdentity ?? {},
    kind: entity.kind,
    lore: lore.map((fragment) => ({ prose: fragment.prose, title: fragment.title })),
    name: entity.name,
    relationships: atlasRelationships(entity, targetsById),
    slug: `atlas:${entity.slug}`,
    status: entity.status,
  });
};

const openEncyclopedia = async (
  context: GraphContext,
  session: ToolSession,
  slug: string
): Promise<string | null> => {
  const entry = await context.encyclopediaStore.getEntry({ slug });
  if (entry === null) {return null;}
  session.recordServedReference({ slug: `encyclopedia:${entry.slug}` });
  return renderBlock({
    aliases: entry.aliases,
    atlasExamples: [...entry.instances, ...entry.members].map((record) => ({
      role: record.subkind,
      slug: record.slug,
      title: record.title,
    })),
    facts: entry.facts,
    identity: entry.descriptiveIdentity,
    kind: entry.kind,
    sections: entry.sections.map((section) => ({
      audience: section.audience,
      heading: section.heading,
      text: section.text,
    })),
    slug: `encyclopedia:${entry.slug}`,
    status: entry.status,
    subkind: entry.subkind,
    summary: entry.summary,
    tiers: entry.tiers,
    title: entry.title,
    topics: entry.topics,
    usage: entry.usage,
  });
};

const openChronicleTurn = async (
  context: GraphContext,
  session: ToolSession,
  slug: string
): Promise<string | null> => {
  const match = /^turn-(\d+)$/u.exec(slug);
  if (match === null) {return null;}
  const sequence = Number(match[1]);
  const turns = await context.chronicleStore.listTurnWindow({
    chronicleId: context.chronicleId,
    fromSequence: sequence,
    limit: 1,
    toSequence: sequence,
  });
  const turn = turns.find((candidate) => candidate.turnSequence === sequence);
  if (turn === undefined) {return null;}
  session.recordServedReference({ slug: `chronicle:${slug}` });
  return renderBlock(renderTurn(turn));
};

type OpenedReference = {
  qualifiedSlug: string;
  result: string;
};

const openQualified = async (
  { context, session }: ToolDeps,
  qualifiedSlug: string
): Promise<OpenedReference> => {
  const separator = qualifiedSlug.indexOf(':');
  const source = qualifiedSlug.slice(0, separator);
  const bare = qualifiedSlug.slice(separator + 1);
  let result: string | null = null;
  if (source === 'atlas') {
    result = await openAtlas(context, session, bare);
  } else if (source === 'encyclopedia') {
    result = await openEncyclopedia(context, session, bare);
  } else if (source === 'chronicle') {
    result = await openChronicleTurn(context, session, bare);
  }
  if (result === null) {
    throw new RetrievalMissError(
      `No reference has slug "${qualifiedSlug}". ${INVENTION_POLICY}`
    );
  }
  return { qualifiedSlug, result };
};

const openBare = async (deps: ToolDeps, slug: string): Promise<OpenedReference> => {
  const { context } = deps;
  const sequence = /^turn-\d+$/u.test(slug) ? Number(slug.slice(5)) : null;
  const [atlas, encyclopedia, chronicle] = await Promise.all([
    visibleAtlas(context, slug),
    context.encyclopediaStore.getEntry({ slug }),
    sequence === null
      ? Promise.resolve([])
      : context.chronicleStore.listTurnWindow({
        chronicleId: context.chronicleId,
        fromSequence: sequence,
        limit: 1,
        toSequence: sequence,
      }),
  ]);
  const alternatives = [
    ...(atlas === null ? [] : [`atlas:${slug}`]),
    ...(encyclopedia === null ? [] : [`encyclopedia:${slug}`]),
    ...(chronicle.some((turn) => turn.turnSequence === sequence) ? [`chronicle:${slug}`] : []),
  ];
  if (alternatives.length === 0) {
    throw new RetrievalMissError(`No reference has slug "${slug}". ${INVENTION_POLICY}`);
  }
  if (alternatives.length > 1) {
    throw new RetrievalMissError(
      `Slug "${slug}" is ambiguous. Open one of: ${alternatives.join(', ')}.`
    );
  }
  const qualified = alternatives[0];
  if (qualified === undefined) {
    throw new RetrievalMissError(`No reference has slug "${slug}".`);
  }
  return openQualified(deps, qualified);
};

const openTool = (deps: ToolDeps): AgentTool => tool({
  description:
    'Open one Atlas, Encyclopedia, or Chronicle result. Pass the fully qualified slug from '
    + 'search unchanged. A bare slug is accepted only when it identifies exactly one record '
    + 'across all three catalogs; a collision returns the qualified alternatives.',
  execute: async ({ slug }: { slug: string }) => {
    const opened = slug.includes(':')
      ? await openQualified(deps, slug)
      : await openBare(deps, slug);
    return deps.session.wrapResult(`open:${opened.qualifiedSlug}`, () => opened.result);
  },
  inputSchema: z.object({ slug: z.string().min(1) }),
});

/** Records every call so the evaluator judges only material actually returned. */
const withCallRecording = (
  { context, session }: ToolDeps,
  toolName: string,
  agentTool: AgentTool
): AgentTool => {
  const inner = (agentTool as { execute: (input: unknown, options: unknown) => unknown }).execute;
  return {
    ...agentTool,
    execute: async (input: unknown, options: unknown): Promise<unknown> => {
      const startedAt = Date.now();
      const inputText = JSON.stringify(input).slice(0, 300);
      try {
        const result = await inner(input, options);
        session.recordCall({
          input: inputText,
          outcome: { result: typeof result === 'string' ? result : JSON.stringify(result) },
          tool: toolName,
        });
        log('info', 'prose-agent.tool.call', {
          chronicleId: context.chronicleId,
          durationMs: Date.now() - startedAt,
          input: inputText,
          resultChars: typeof result === 'string' ? result.length : -1,
          tool: toolName,
          turnId: context.turnId,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        session.recordCall({ input: inputText, outcome: { error: message }, tool: toolName });
        log(error instanceof RetrievalMissError ? 'info' : 'warn', 'prose-agent.tool.threw', {
          chronicleId: context.chronicleId,
          durationMs: Date.now() - startedAt,
          input: inputText,
          message,
          tool: toolName,
          turnId: context.turnId,
        });
        throw error;
      }
    },
  };
};

export const createProseAgentTools = (deps: ToolDeps): ToolSet => {
  const tools: ToolSet = {
    open: openTool(deps),
    search: searchTool(deps),
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, agentTool]) => [
      name,
      withCallRecording(deps, name, agentTool),
    ])
  );
};
