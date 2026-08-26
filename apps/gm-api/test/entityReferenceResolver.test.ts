import { describe, expect, it, vi } from 'vitest';

import { EntityReferenceResolverNode } from '../src/gmGraph/nodes/EntityReferenceResolverNode';
import type { EntitySnippet, GraphContext } from '../src/types';
import { buildContext } from './harness';

const ENTITY_ID = '11111111-2222-4333-8444-555555555555';

const entity = (): EntitySnippet => ({
  description: 'A vessel whose captain rejects insulting fares.',
  facts: { aka: 'Old Bell' },
  gmNotes: [{ kind: 'triggered_by' as const, text: 'The captain refuses low-ball transit fares.' }],
  id: ENTITY_ID,
  kind: 'transport',
  loreFragments: [],
  name: 'Bellwether',
  score: 2,
  slug: 'bellwether',
  tags: ['transit'],
  unwritten: false,
});

/**
 * Grounding reads canon directly now, so the fixture is a world store that
 * answers with the one entity rather than a pre-scored slice on the context.
 */
const contextWithEntity = (overrides?: Partial<GraphContext>): GraphContext => {
  const candidate = entity();
  const store = {
    findEntitiesMentionedIn: ({ text }: { text: string }) => Promise.resolve(
      /bellwether|old bell/iu.test(text) ? [candidate] : []
    ),
    findReferenceCandidates: () => Promise.resolve([]),
    listEntitiesByIds: () => Promise.resolve([candidate]),
  } as unknown as GraphContext['worldSchemaStore'];
  return buildContext({ worldSchemaStore: store, ...overrides });
};

describe('EntityReferenceResolverNode', () => {
  it('records an exact alias span without invoking semantic search', async () => {
    const embed = vi.fn();
    const context = contextWithEntity({
      embeddings: { embed },
      playerMessage: {
        content: 'I ask Old Bell for passage.',
        id: 'message-1',
        metadata: { tags: [], timestamp: 0 },
        role: 'player',
      },
    });

    const result = await new EntityReferenceResolverNode('player').execute(context);

    expect(result.entityReferences).toEqual([
      expect.objectContaining({
        entityId: ENTITY_ID,
        method: 'exact',
        span: { end: 14, start: 6, text: 'Old Bell' },
        speaker: 'player',
      }),
    ]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('records an explicit target even when the player does not name it', async () => {
    const context = contextWithEntity({
      playerMessage: {
        content: 'I ask whether the fare is negotiable.',
        id: 'message-2',
        metadata: { tags: [], timestamp: 0 },
        role: 'player',
      },
      targetEntityIds: [ENTITY_ID],
    });

    const result = await new EntityReferenceResolverNode('player').execute(context);

    expect(result.entityReferences).toEqual([
      expect.objectContaining({
        entityId: ENTITY_ID,
        method: 'explicit',
        span: null,
      }),
    ]);
  });

  it('accepts a vague phrase only after vector ranking and structured resolution', async () => {
    const context = contextWithEntity({
      embeddings: { embed: () => Promise.resolve([0.1, 0.2]) },
      llm: {
        generateStructured: () => Promise.resolve({
          data: { matches: [{ slug: 'bellwether', text: 'the captain' }] },
        }),
      } as unknown as GraphContext['llm'],
      modelConfigStore: {
        getModelForCategory: () => Promise.resolve({ id: 'model' }),
      } as unknown as GraphContext['modelConfigStore'],
      playerMessage: {
        content: 'I offer the captain half the posted fare.',
        id: 'message-3',
        metadata: { tags: [], timestamp: 0 },
        role: 'player',
      },
      templates: {
        render: () => Promise.resolve('Resolve references.'),
      } as unknown as GraphContext['templates'],
      worldSchemaStore: {
        findEntitiesMentionedIn: () => Promise.resolve([]),
        findReferenceCandidates: () => Promise.resolve([{
          id: ENTITY_ID,
          name: 'Bellwether',
          similarity: 0.79,
          slug: 'bellwether',
        }]),
        listEntitiesByIds: () => Promise.resolve([entity()]),
      } as unknown as GraphContext['worldSchemaStore'],
    });

    const result = await new EntityReferenceResolverNode('player').execute(context);

    expect(result.entityReferences).toEqual([
      expect.objectContaining({
        confidence: 0.79,
        entityId: ENTITY_ID,
        method: 'semantic',
        span: { end: 19, start: 8, text: 'the captain' },
      }),
    ]);
  });

  it('searches the whole entity space, not the turn\'s candidate slice', async () => {
    const findReferenceCandidates = vi.fn(
      (_input: Record<string, unknown>) => Promise.resolve([])
    );
    const context = contextWithEntity({
      embeddings: { embed: () => Promise.resolve([0.1, 0.2]) },
      playerMessage: {
        content: 'I ask whether the fare is negotiable.',
        id: 'message-4',
        metadata: { tags: [], timestamp: 0 },
        role: 'player',
      },
      worldSchemaStore: {
        findEntitiesMentionedIn: () => Promise.resolve([]),
        findReferenceCandidates,
        listEntitiesByIds: () => Promise.resolve([]),
      } as unknown as GraphContext['worldSchemaStore'],
    });

    await new EntityReferenceResolverNode('player').execute(context);

    const input = findReferenceCandidates.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(input)).not.toContain('candidateIds');
  });
});
