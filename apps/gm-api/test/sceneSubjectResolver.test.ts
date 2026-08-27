import { describe, expect, it, vi } from 'vitest';

import { SceneSubjectResolverNode } from '../src/gmGraph/nodes/SceneSubjectResolverNode';
import type { GraphContext } from '../src/types';
import { buildContext, buildIntent } from './harness';

const AMAYA_ID = '11111111-2222-4333-8444-555555555555';
const AMAYA_NAME = 'Amaya Venn';
const ANCHOR_ID = '99999999-8888-4777-8666-555555555555';

const sceneContext = (overrides?: Partial<GraphContext>): GraphContext => buildContext({
  effectiveScene: {
    id: 'scene:turn-1',
    progress: 0,
    progressTarget: 4,
    startedAtTurn: 1,
    subject: AMAYA_NAME,
    subjectKind: 'npc',
    type: 'dialog',
  },
  playerIntent: buildIntent({
    sceneChange: {
      subject: AMAYA_NAME,
      subjectKind: 'npc',
      type: 'dialog',
    },
  }),
  ...overrides,
});

describe('SceneSubjectResolverNode', () => {
  it('links a unique exact name and kind without requesting an embedding', async () => {
    const embed = vi.fn();
    const context = sceneContext({
      embeddings: { embed },
      worldSchemaStore: {
        findEntitiesByName: () => Promise.resolve([{
          id: AMAYA_ID,
          kind: 'npc',
        }]),
      } as unknown as GraphContext['worldSchemaStore'],
    });

    const result = await new SceneSubjectResolverNode().execute(context);

    expect(result.effectiveScene?.subjectEntityId).toBe(AMAYA_ID);
    expect(result.playerIntent?.sceneChange?.subjectEntityId).toBe(AMAYA_ID);
    expect(embed).not.toHaveBeenCalled();
  });

  it('accepts a vector candidate above the resolver similarity floor', async () => {
    const findSubjectCandidates = vi.fn().mockResolvedValue([{
      hops: 2,
      id: AMAYA_ID,
      kind: 'npc',
      name: AMAYA_NAME,
      prominence: 'marginal',
      reach: 0.7,
      score: 0.82,
      similarity: 0.46,
      slug: 'amaya_venn',
    }]);
    const context = sceneContext({
      embeddings: { embed: () => Promise.resolve([0.1, 0.2]) },
      worldSchemaStore: {
        findEntitiesByName: () => Promise.resolve([]),
        findLocationByName: () => Promise.resolve(null),
        findSubjectCandidates,
        hasEntityEmbeddings: () => Promise.resolve(true),
      } as unknown as GraphContext['worldSchemaStore'],
    });
    context.chronicleState.chronicle.anchorEntityId = ANCHOR_ID;

    const result = await new SceneSubjectResolverNode().execute(context);

    expect(findSubjectCandidates).toHaveBeenCalledWith(expect.objectContaining({
      focusIds: [ANCHOR_ID],
      kind: 'npc',
    }));
    expect(result.effectiveScene?.subjectEntityId).toBe(AMAYA_ID);
  });

  it('keeps an ambiguous subject as free text', async () => {
    const context = sceneContext({
      embeddings: { embed: () => Promise.resolve([0.1, 0.2]) },
      worldSchemaStore: {
        findEntitiesByName: () => Promise.resolve([]),
        findLocationByName: () => Promise.resolve(null),
        findSubjectCandidates: () => Promise.resolve([
          {
            hops: 1,
            id: AMAYA_ID,
            kind: 'npc',
            name: AMAYA_NAME,
            prominence: 'recognized',
            reach: 0.8,
            score: 0.8,
            similarity: 0.82,
            slug: 'amaya_venn',
          },
          {
            hops: 1,
            id: ANCHOR_ID,
            kind: 'npc',
            name: 'Amaya Renn',
            prominence: 'recognized',
            reach: 0.8,
            score: 0.78,
            similarity: 0.81,
            slug: 'amaya_renn',
          },
        ]),
        hasEntityEmbeddings: () => Promise.resolve(true),
      } as unknown as GraphContext['worldSchemaStore'],
    });

    expect(await new SceneSubjectResolverNode().execute(context)).toEqual({});
  });
});
