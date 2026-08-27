import { renderBlock } from '@glass-frontier/app';
import type { HardState } from '@glass-frontier/dto';
import { type ToolSet, tool } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import { recordedPlayerMessage } from '../prompts/contextFormaters';
import type { GraphContext } from '../types';
import { buildTocEntries, renderWorldIndex } from './seedPack';
import type { ToolSession } from './toolSession';

const UNKNOWN_ENTITY_POLICY =
  'If it exists under another name, find its slug with search; if the player '
  + 'coined the name, search_history finds where the chronicle established it. '
  + 'A name with no canon entry and no history is new fiction: brief it as '
  + 'unwritten, never as established canon.';

const LORE_EXCERPT_LENGTH = 200;
const MAX_EXPAND_NEIGHBORS = 8;
/** Shadewell has eleven passages; a whole-entity read must still fit a round. */
const MAX_OPEN_LORE = 6;
/**
 * Below this cosine similarity a "match" is embedding noise.
 *
 * Re-measured against 400 production canon entities under Cohere Embed v4 at
 * 1024 dimensions, queries embedded as `search_query` and canon as
 * `search_document`. Thirteen invented phrases ("globitz", "the Zorbnak
 * Protocol", "a snorklewhack in the manifold") top out at 0.305; ten topical
 * paraphrases run 0.261–0.473; fourteen real names run 0.474–0.660. At 0.32
 * every invented phrase is rejected and nine of ten paraphrases survive — the
 * tenth, "the law about cooling during a heat emergency", scores 0.261 and
 * sits inside the invented band, so no floor separates it.
 *
 * Titan's 0.4 does not transfer: under this model it would discard six of the
 * ten paraphrases, which is most of what searching by meaning is for.
 */
export const SEARCH_SIMILARITY_FLOOR = 0.32;

/**
 * A retrieval miss is an error, not a result: as text it reads as world-fact
 * and has ended up in a brief verbatim ("The Globitz entity does not exist in
 * the current canon"). The loop surfaces a thrown error to the model as a
 * failed call, which it answers by trying another tool instead of briefing it.
 */
class RetrievalMissError extends Error {}

type ToolDeps = {
  context: GraphContext;
  session: ToolSession;
};

type AgentTool = ToolSet[string];

const unknownEntity = (slug: string): string =>
  `No canon entity with slug "${slug}". ${UNKNOWN_ENTITY_POLICY}`;

const MISSING_LORE = (slugs: string[]): string =>
  `No lore passage has the loreSlug ${slugs.join(', ')}. `
  + 'Use a loreSlug exactly as search_lore returned it.';

const resolveVisible = async (
  store: GraphContext['worldSchemaStore'],
  slug: string
): Promise<HardState | null> => {
  const entity = await store.getEntityBySlug({ slug });
  return entity === null || entity.dm ? null : entity;
};

/** Verbatim unless the message is oversized, and then its paraphrase. */
const renderTurn = (turn: GraphContext['chronicleState']['turns'][number]): unknown => ({
  gm: turn.gmSummary ?? turn.gmResponse?.content,
  player: recordedPlayerMessage(
    turn.playerMessage.content, turn.playerIntent?.intentSummary
  ),
  seq: turn.turnSequence,
});

/**
 * One entity, opened whole, rendered as labeled text rather than escaped
 * JSON: a result the model has to mentally unescape is a result it reasons
 * over worse and reuses less.
 */
const openTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read one canon entity whole, by slug. Returns its description, fact '
    + 'card, GM notes, identity prose, and written passages — `notes` narrows '
    + 'to how it is run and what it is like, `lore` to its passages, `both` '
    + '(the default) gives everything. Use it for every entity that matters '
    + 'to the turn once you hold its slug from the index or from search. It '
    + 'reads canon only: for what happened in play, use search_history.',
  execute: async ({ include, slug }: { include?: 'notes' | 'lore' | 'both'; slug: string }) => {
    const want = include ?? 'both';
    const entity = await resolveVisible(context.worldSchemaStore, slug);
    if (entity === null) {
      throw new RetrievalMissError(unknownEntity(slug));
    }
    session.recordServedEntity({ id: entity.id, slug: entity.slug });
    const lore = want === 'notes'
      ? []
      : await context.worldSchemaStore.listLoreFragmentsByEntity({
        entityId: entity.id, limit: MAX_OPEN_LORE,
      });
    return session.wrapResult(`open:${slug}:${want}`, () => renderBlock({
      description: entity.description,
      facts: entity.facts,
      ...want === 'lore' ? {} : {
        gmNotes: (entity.gmNotes ?? []).map((note) => `${note.kind}: ${note.text}`),
        identity: entity.descriptiveIdentity ?? {},
      },
      kind: entity.kind,
      ...want === 'notes' ? {} : {
        lore: lore.map((fragment) => ({ prose: fragment.prose, title: fragment.title })),
      },
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
    }));
  },
  inputSchema: z.object({
    include: z.enum(['notes', 'lore', 'both']).optional(),
    slug: z.string(),
  }),
});

/** One edge, both endpoints named — no candidate-set arrays to assemble. */
const readRelationshipTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read what joins two specific canon entities: the verb between them and '
    + 'everything canon says about how that tie works. Use it when both slugs '
    + 'are in hand and their standing with each other bears on the turn — an '
    + 'employer and a worker, rivals, a keeper and its charge. It answers '
    + 'nothing about either entity alone; open does that.',
  execute: async ({ slug, targetSlug }: { slug: string; targetSlug: string }) => {
    const store = context.worldSchemaStore;
    const [entity, target] = await Promise.all([
      resolveVisible(store, slug),
      resolveVisible(store, targetSlug),
    ]);
    if (entity === null || target === null) {
      throw new RetrievalMissError(unknownEntity(entity === null ? slug : targetSlug));
    }
    const edges = entity.links.filter(
      (link) => link.live !== false && link.targetId === target.id
    );
    if (edges.length === 0) {
      return session.wrapResult(`relationship:${slug}:${targetSlug}`, () =>
        `No live relationship between ${slug} and ${targetSlug}. `
        + 'Check either entity\'s world-index entry for its actual relationships.');
    }
    session.recordServedEntity({ id: entity.id, slug: entity.slug });
    session.recordServedEntity({ id: target.id, slug: target.slug });
    return session.wrapResult(`relationship:${slug}:${targetSlug}`, () => renderBlock(
      edges.map((edge) => ({
        direction: edge.direction,
        identity: edge.descriptiveIdentity ?? {},
        target: targetSlug,
        verb: edge.relationship,
      }))
    ));
  },
  inputSchema: z.object({ slug: z.string(), targetSlug: z.string() }),
});

/** Discovery stays cheap: neighbors as index entries — key names, no values. */
const expandTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'List compact world-index entries for one entity\'s neighbors: how much '
    + 'each has to open and its edges as "verb:slug" handles, no content. Use '
    + 'it to see what surrounds a place or figure before deciding what to '
    + 'open; it never returns the material itself.',
  execute: async ({ slug }: { slug: string }) => {
    const entity = await resolveVisible(context.worldSchemaStore, slug);
    if (entity === null) {
      throw new RetrievalMissError(unknownEntity(slug));
    }
    const targetIds = entity.links
      .filter((link) => link.live !== false)
      .map((link) => link.targetId)
      .slice(0, MAX_EXPAND_NEIGHBORS);
    const neighbors = await context.worldSchemaStore.listEntitiesByIds(targetIds);
    const entries = await buildTocEntries(context.worldSchemaStore, neighbors);
    return session.wrapResult(`expand:${slug}`, () => renderWorldIndex(entries));
  },
  inputSchema: z.object({ slug: z.string() }),
});

const searchTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Find canon entities by meaning — a name, a role, a phrase of the '
    + 'player\'s. Most of the world is not in WORLD-INDEX, and things often '
    + 'live under another name than the player used; this is how the rest of '
    + 'canon is reached. Returns slugs with a similarity score for open, '
    + 'read_relationship, and expand. It finds entities only: for passages of '
    + 'writing use search_lore, and for events of this chronicle use '
    + 'search_history.',
  execute: async ({ query }: { query: string }) => {
    const embedding = await context.embeddings.embed(query, 'query');
    const candidates = await context.worldSchemaStore.findEntityCandidates({
      embedding,
      limit: 5,
    });
    const matches = candidates.filter(
      (candidate) => candidate.similarity >= SEARCH_SIMILARITY_FLOOR
    );
    if (matches.length === 0) {
      const nearest = candidates.map((candidate) => candidate.name).join(', ');
      throw new RetrievalMissError(
        `Nothing in canon matches "${query}"`
        + `${nearest.length === 0 ? '' : ` (nearest, all unrelated: ${nearest})`}. `
        + UNKNOWN_ENTITY_POLICY
      );
    }
    return session.wrapResult(`search:${query}`, () => renderBlock(
      matches.map((candidate) => ({
        kind: candidate.kind,
        name: candidate.name,
        similarity: Math.round(candidate.similarity * 100) / 100,
        slug: candidate.slug,
      }))
    ));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const searchLoreTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Full-text search the canon\'s written passages for keywords — texture '
    + 'and detail about subjects you already know exist. Use it after search '
    + 'or the index has named the subject, to reach writing that opening one '
    + 'entity would miss; include the subject\'s name in the query to scope '
    + 'to it. It reads authored canon, never the events of this chronicle — '
    + 'those live in search_history.',
  execute: async ({ query }: { query: string }) => {
    const fragments = await context.worldSchemaStore.searchLoreFragments({
      limit: 5,
      query,
    });
    if (fragments.length === 0) {
      throw new RetrievalMissError(
        `No lore matches "${query}". Search again with different words, or `
        + 'search entities by meaning instead.'
      );
    }
    return session.wrapResult(`search-lore:${query}`, () => renderBlock(
      fragments.map((fragment) => ({
        excerpt: fragment.prose.slice(0, LORE_EXCERPT_LENGTH),
        loreSlug: fragment.slug,
        readWith: 'read_lore',
        title: fragment.title,
      }))
    ));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

/**
 * `loreSlug`, not `slug`: a passage handle and an entity slug are different
 * namespaces, and while both were called `slug` the model fed the handle it
 * had just been given to the tool whose parameter matched the name. Fifteen of
 * the twenty-nine tool errors on Radiators Raised in Daylight were
 * `open({ slug: 'frag_heavy_hauler' })` and its kind.
 */
const readLoreTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read up to five full lore passages by the loreSlug handles search_lore '
    + 'returned. The excerpts search_lore shows are openings, not the whole; '
    + 'read the full passage before the brief relies on it. A loreSlug names a '
    + 'passage and is only ever read here — open takes entity slugs and will '
    + 'not find one.',
  execute: async ({ loreSlugs }: { loreSlugs: string[] }) => {
    const wanted = loreSlugs.slice(0, 5);
    const fragments = await context.worldSchemaStore.listLoreFragmentsBySlugs({
      slugs: wanted,
    });
    for (const fragment of fragments) {
      session.recordServedEntity({ id: fragment.entityId, slug: fragment.entitySlug });
    }
    const missing = wanted.filter(
      (slug) => !fragments.some((fragment) => fragment.slug === slug)
    );
    if (fragments.length === 0) {
      throw new RetrievalMissError(MISSING_LORE(missing));
    }
    return session.wrapResult(`lore:${[...wanted].sort().join(',')}`, () => renderBlock({
      fragments: fragments.map((fragment) => ({
        entitySlug: fragment.entitySlug,
        prose: fragment.prose,
        title: fragment.title,
      })),
      ...missing.length > 0 && { note: MISSING_LORE(missing) },
    }));
  },
  inputSchema: z.object({ loreSlugs: z.array(z.string()).min(1).max(5) }),
});

const searchHistoryTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Full-text search this chronicle\'s own past turns for an event, name, '
    + 'or phrase. The chronicle\'s memory beyond RECENT-EVENTS lives here and '
    + 'nowhere else: names the player coined, promises made, damage done, and '
    + 'anything narration established are in past turns, not in canon, and a '
    + 'brief written without them repeats or contradicts what the story '
    + 'already settled. Returns turn sequence numbers for read_turns.',
  execute: async ({ query }: { query: string }) => {
    const turns = await context.chronicleStore.searchTurns({
      chronicleId: context.chronicleId,
      limit: 5,
      query,
    });
    if (turns.length === 0) {
      throw new RetrievalMissError(
        `No past turn mentions "${query}". Search again with different words, `
        + 'or read_turns for the stretch of play where it would have happened.'
      );
    }
    return session.wrapResult(`search-history:${query}`, () => renderBlock(
      turns.map(renderTurn)
    ));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const readTurnsTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read ten consecutive past turns of this chronicle starting at a '
    + 'sequence number, in play order — the full record of what was said and '
    + 'narrated. Use it to read around a turn search_history found, or to '
    + 'walk a stretch of play from its start.',
  execute: async ({ fromSequence }: { fromSequence: number }) => {
    const turns = await context.chronicleStore.listTurnWindow({
      chronicleId: context.chronicleId,
      fromSequence,
      limit: 10,
      toSequence: fromSequence + 9,
    });
    return session.wrapResult(`turns:${fromSequence}`, () => renderBlock(
      turns.map(renderTurn)
    ));
  },
  inputSchema: z.object({ fromSequence: z.number().int().nonnegative() }),
});

/**
 * Logs every executed call and lands it in the session's retrieval record —
 * result or miss — so the evaluator judges from what was actually retrieved.
 * Schema-invalid calls never reach execute; those surface through the loop's
 * per-step toolErrors.
 */
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
        session.recordCall({
          input: inputText,
          outcome: { error: message },
          tool: toolName,
        });
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
    expand: expandTool(deps),
    open: openTool(deps),
    read_lore: readLoreTool(deps),
    read_relationship: readRelationshipTool(deps),
    read_turns: readTurnsTool(deps),
    search: searchTool(deps),
    search_history: searchHistoryTool(deps),
    search_lore: searchLoreTool(deps),
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, agentTool]) => [
      name,
      withCallRecording(deps, name, agentTool),
    ])
  );
};
