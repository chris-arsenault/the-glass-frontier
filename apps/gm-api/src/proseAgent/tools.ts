import type { HardState } from '@glass-frontier/dto';
import { ProseAgentResult } from '@glass-frontier/dto';
import { type ToolSet, tool } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import { z } from 'zod';

import type { GraphContext } from '../types';
import { buildTocEntries, renderWorldIndex } from './seedPack';
import type { ToolSession } from './toolSession';

const UNKNOWN_ENTITY_POLICY =
  'If it exists under another name, find its slug with search. If nothing '
  + 'matches, it has no canon entry: do not present it as established canon; '
  + 'the template\'s invention rules govern whether it may appear as new fiction.';

const LORE_EXCERPT_LENGTH = 200;
const HISTORY_CONTENT_LENGTH = 300;
const MAX_EXPAND_NEIGHBORS = 8;

type ToolDeps = {
  context: GraphContext;
  session: ToolSession;
};

type AgentTool = ToolSet[string];

const unknownEntity = (slug: string): string =>
  `No canon entity with slug "${slug}". ${UNKNOWN_ENTITY_POLICY}`;

const resolveVisible = async (
  store: GraphContext['worldSchemaStore'],
  slug: string
): Promise<HardState | null> => {
  const entity = await store.getEntityBySlug({ slug });
  return entity === null || entity.dm ? null : entity;
};

const renderTurn = (turn: GraphContext['chronicleState']['turns'][number]): unknown => ({
  gm: turn.gmSummary ?? turn.gmResponse?.content.slice(0, HISTORY_CONTENT_LENGTH),
  player: turn.playerMessage.content.slice(0, HISTORY_CONTENT_LENGTH),
  seq: turn.turnSequence,
});

/**
 * Selective by construction: the caller names the identity keys it wants (the
 * world index lists them), and only those values enter the transcript. The
 * short facts card and description ride along because they are a few tokens
 * and ground the fields.
 */
const readIdentityTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read the named identity fields of one entity, by the key names its '
    + 'world-index entry lists. Also returns its short description and facts.',
  execute: async ({ keys, slug }: { keys: string[]; slug: string }) => {
    const entity = await resolveVisible(context.worldSchemaStore, slug);
    if (entity === null) {
      return session.wrapResult(`identity:${slug}`, () => unknownEntity(slug));
    }
    session.recordServedEntity(entity.id, entity.slug);
    const identity = entity.descriptiveIdentity ?? {};
    const requested = Object.fromEntries(
      Object.entries(identity).filter(([key]) => keys.includes(key))
    );
    const missing = keys.filter((key) => !(key in identity));
    return session.wrapResult(
      `identity:${slug}:${[...keys].sort().join(',')}`,
      () => JSON.stringify({
        description: entity.description,
        facts: entity.facts,
        identity: requested,
        ...missing.length > 0 && { missingKeys: missing },
        name: entity.name,
        slug: entity.slug,
        status: entity.status,
      })
    );
  },
  inputSchema: z.object({
    keys: z.array(z.string()).min(1),
    slug: z.string(),
  }),
});

/** One edge, both endpoints named — no candidate-set arrays to assemble. */
const readRelationshipTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read the descriptive fields (terms, basis, conduct, cost, ...) of the '
    + 'relationship between two entities named by slug.',
  execute: async ({ slug, targetSlug }: { slug: string; targetSlug: string }) => {
    const store = context.worldSchemaStore;
    const [entity, target] = await Promise.all([
      resolveVisible(store, slug),
      resolveVisible(store, targetSlug),
    ]);
    if (entity === null || target === null) {
      return session.wrapResult(`relationship:${slug}:${targetSlug}`, () =>
        unknownEntity(entity === null ? slug : targetSlug));
    }
    const edges = entity.links.filter(
      (link) => link.live !== false && link.targetId === target.id
    );
    if (edges.length === 0) {
      return session.wrapResult(`relationship:${slug}:${targetSlug}`, () =>
        `No live relationship between ${slug} and ${targetSlug}. `
        + 'Check either entity\'s world-index entry for its actual relationships.');
    }
    session.recordServedEntity(entity.id, entity.slug);
    session.recordServedEntity(target.id, target.slug);
    return session.wrapResult(`relationship:${slug}:${targetSlug}`, () => JSON.stringify(
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
    'List compact world-index entries for an entity\'s neighbors: identity '
    + 'field names, lore counts, and edges as "verb:slug" handles — no field '
    + 'content.',
  execute: async ({ slug }: { slug: string }) => {
    const entity = await resolveVisible(context.worldSchemaStore, slug);
    if (entity === null) {
      return session.wrapResult(`expand:${slug}`, () => unknownEntity(slug));
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
    'Find canon entities by meaning — a name, a role, a place. Returns slugs '
    + 'for read_identity, read_relationship, and expand.',
  execute: async ({ query }: { query: string }) => {
    const embedding = await context.embeddings.embed(query);
    const candidates = await context.worldSchemaStore.findEntityCandidates({
      embedding,
      limit: 5,
    });
    return session.wrapResult(`search:${query}`, () =>
      candidates.length === 0
        ? `No canon entity resembles "${query}". ${UNKNOWN_ENTITY_POLICY}`
        : JSON.stringify(candidates.map((candidate) => ({
          kind: candidate.kind,
          name: candidate.name,
          slug: candidate.slug,
        }))));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const searchLoreTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Full-text search lore prose across all canon. Include an entity\'s name '
    + 'in the query to scope to it. Returns lore slugs for read_lore.',
  execute: async ({ query }: { query: string }) => {
    const fragments = await context.worldSchemaStore.searchLoreFragments({
      limit: 5,
      query,
    });
    return session.wrapResult(`search-lore:${query}`, () =>
      fragments.length === 0
        ? `No lore matches "${query}".`
        : JSON.stringify(fragments.map((fragment) => ({
          excerpt: fragment.prose.slice(0, LORE_EXCERPT_LENGTH),
          slug: fragment.slug,
          title: fragment.title,
        }))));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const readLoreTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read up to five full lore fragments by the lore slugs search_lore '
    + 'returned.',
  execute: async ({ slugs }: { slugs: string[] }) => {
    const wanted = slugs.slice(0, 5);
    const fragments = await context.worldSchemaStore.listLoreFragmentsBySlugs({
      slugs: wanted,
    });
    for (const fragment of fragments) {
      session.recordServedEntity(fragment.entityId, fragment.entitySlug);
    }
    const missing = wanted.filter(
      (slug) => !fragments.some((fragment) => fragment.slug === slug)
    );
    return session.wrapResult(`lore:${[...wanted].sort().join(',')}`, () => JSON.stringify({
      fragments: fragments.map((fragment) => ({
        entitySlug: fragment.entitySlug,
        prose: fragment.prose,
        title: fragment.title,
      })),
      ...missing.length > 0 && {
        note: `No lore fragment has the slug ${missing.join(', ')}. `
          + 'Use a slug exactly as search_lore returned it.',
      },
    }));
  },
  inputSchema: z.object({ slugs: z.array(z.string()).min(1).max(5) }),
});

const searchHistoryTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Full-text search this chronicle\'s past turns for an event or phrase. '
    + 'Returns turn sequence numbers for read_turns.',
  execute: async ({ query }: { query: string }) => {
    const turns = await context.chronicleStore.searchTurns({
      chronicleId: context.chronicleId,
      limit: 5,
      query,
    });
    return session.wrapResult(`search-history:${query}`, () =>
      turns.length === 0
        ? `No past turn matches "${query}".`
        : JSON.stringify(turns.map(renderTurn)));
  },
  inputSchema: z.object({ query: z.string().min(2) }),
});

const readTurnsTool = ({ context, session }: ToolDeps): AgentTool => tool({
  description:
    'Read ten consecutive past turns starting at a sequence number, in play '
    + 'order.',
  execute: async ({ fromSequence }: { fromSequence: number }) => {
    const turns = await context.chronicleStore.listTurnWindow({
      chronicleId: context.chronicleId,
      fromSequence,
      limit: 10,
      toSequence: fromSequence + 9,
    });
    return session.wrapResult(`turns:${fromSequence}`, () =>
      JSON.stringify(turns.map(renderTurn)));
  },
  inputSchema: z.object({ fromSequence: z.number().int().nonnegative() }),
});

const submitTurnTool = (): AgentTool => tool({
  description:
    'Submit the final narration and its entity sidecar. The only way to '
    + 'finish the turn.',
  execute: (input: ProseAgentResult) => input,
  inputSchema: ProseAgentResult,
});

/**
 * Logs every executed call with its received arguments so misdesigned or
 * misused signatures are debuggable from production logs. Schema-invalid
 * calls never reach execute; those surface through the loop's per-step
 * toolErrors (logged by the panel).
 */
const withCallLogging = (
  context: GraphContext,
  toolName: string,
  agentTool: AgentTool
): AgentTool => {
  const inner = (agentTool as { execute: (input: unknown, options: unknown) => unknown }).execute;
  return {
    ...agentTool,
    execute: async (input: unknown, options: unknown): Promise<unknown> => {
      const startedAt = Date.now();
      try {
        const result = await inner(input, options);
        log('info', 'prose-agent.tool.call', {
          chronicleId: context.chronicleId,
          durationMs: Date.now() - startedAt,
          input: JSON.stringify(input).slice(0, 300),
          resultChars: typeof result === 'string' ? result.length : -1,
          tool: toolName,
          turnId: context.turnId,
        });
        return result;
      } catch (error) {
        log('warn', 'prose-agent.tool.threw', {
          chronicleId: context.chronicleId,
          durationMs: Date.now() - startedAt,
          input: JSON.stringify(input).slice(0, 300),
          message: error instanceof Error ? error.message : 'unknown',
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
    read_identity: readIdentityTool(deps),
    read_lore: readLoreTool(deps),
    read_relationship: readRelationshipTool(deps),
    read_turns: readTurnsTool(deps),
    search: searchTool(deps),
    search_history: searchHistoryTool(deps),
    search_lore: searchLoreTool(deps),
    submit_turn: submitTurnTool(),
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, agentTool]) => [
      name,
      withCallLogging(deps.context, name, agentTool),
    ])
  );
};
