import { describe, expect, it, vi } from 'vitest';

import { EntityReferenceResolverNode } from '../src/gmGraph/nodes/EntityReferenceResolverNode';
import type { EntitySnippet, GraphContext } from '../src/types';
import { buildContext } from './harness';

const ENTITY_ID = '11111111-2222-4333-8444-555555555555';

const entity = (): EntitySnippet => ({
  description: 'A vessel whose captain rejects insulting fares.',
  facts: { aka: 'Old Bell' },
  gmNotes: ['The captain refuses low-ball transit fares.'],
  id: ENTITY_ID,
  kind: 'transport',
  loreFragments: [],
  name: 'Bellwether',
  score: 2,
  slug: 'bellwether',
  tags: ['transit'],
});

const contextWithEntity = (overrides?: Partial<GraphContext>): GraphContext => {
  const candidate = entity();
  return buildContext({
    entityContext: {
      candidates: [candidate],
      focusEntities: [],
      focusTags: [],
      offered: [candidate],
      roster: [{
        availability: ['connected'],
        description: candidate.description,
        id: candidate.id,
        kind: candidate.kind,
        name: candidate.name,
        slug: candidate.slug,
      }],
    },
    ...overrides,
  });
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
        findReferenceCandidates: () => Promise.resolve([{
          id: ENTITY_ID,
          name: 'Bellwether',
          similarity: 0.79,
          slug: 'bellwether',
        }]),
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
});
