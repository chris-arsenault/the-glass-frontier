import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { WorldState } from '../src/worldState';
import { proposal, resetDatabase, startHarness } from './harness';

let pool: Pool;
let worldState: WorldState;

beforeAll(async () => {
  ({ pool, worldState } = await startHarness());
});

beforeEach(async () => {
  await resetDatabase(pool);
});

afterAll(async () => {
  await pool.end();
});

const embedding = (second: number): number[] => [
  1,
  second,
  ...Array.from({ length: 254 }, () => 0),
];

describe('entity embedding retrieval', () => {
  it('uses prominence-dependent graph distance for vector candidates', async () => {
    const entities = Array.from({ length: 9 }, (_, index) => ({
      kind: 'npc' as const,
      name: `Person ${index}`,
      prominence: index === 8 ? 'mythic' as const : 'marginal' as const,
      ref: `person-${index}`,
    }));
    const relationships = Array.from({ length: 8 }, (_, index) => ({
      dst: { ref: `person-${index + 1}` },
      relationship: 'cooperates_with' as const,
      src: { ref: `person-${index}` },
      strength: 0.9,
    }));
    const result = await worldState.world.commitBatch(proposal({
      entities,
      relationships,
    }));
    const localMarginal = result.entityIdsByRef['person-2'];
    const remoteMarginal = result.entityIdsByRef['person-3'];
    const remoteMythic = result.entityIdsByRef['person-8'];
    const anchor = result.entityIdsByRef['person-0'];
    if (
      localMarginal === undefined
      || remoteMarginal === undefined
      || remoteMythic === undefined
      || anchor === undefined
    ) {
      throw new Error('Expected every seeded entity ref to resolve.');
    }
    await Promise.all([
      worldState.world.saveEntityEmbedding(localMarginal, embedding(0.01)),
      worldState.world.saveEntityEmbedding(remoteMarginal, embedding(0.02)),
      worldState.world.saveEntityEmbedding(remoteMythic, embedding(0.03)),
    ]);

    const candidates = await worldState.world.findSubjectCandidates({
      embedding: embedding(0),
      focusIds: [anchor],
      kind: 'npc',
      limit: 10,
    });
    const candidateIds = candidates.map((candidate) => candidate.id);

    expect(candidateIds).toContain(localMarginal);
    expect(candidateIds).toContain(remoteMythic);
    expect(candidateIds).not.toContain(remoteMarginal);
    expect(candidates.find((candidate) => candidate.id === remoteMythic)?.hops).toBe(8);
  });
});
