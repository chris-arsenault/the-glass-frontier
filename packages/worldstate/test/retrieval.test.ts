import type { Turn } from '@glass-frontier/dto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { WorldState } from '../src/worldState';
import {
  commitChronicleTurn,
  defaultTurn,
  proposal,
  resetDatabase,
  startHarness,
  TEST_PLAYER_ID,
} from './harness';

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

const gmResponse = (content: string): NonNullable<Turn['gmResponse']> => ({
  content,
  id: crypto.randomUUID(),
  metadata: { tags: [], timestamp: Date.now() },
  role: 'gm',
});

const seedTurns = async (
  contents: Array<{ player: string; gm: string; summary: string }>
): Promise<{ id: string }> => {
  const chronicle = await worldState.chronicles.ensureChronicle({
    locationName: 'Retrieval Test Locale',
    playerId: TEST_PLAYER_ID,
  });
  for (const [index, content] of contents.entries()) {
    // eslint-disable-next-line no-await-in-loop -- turn sequences must commit in order
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, {
        gmResponse: gmResponse(content.gm),
        gmSummary: content.summary,
        playerMessage: {
          content: content.player,
          id: crypto.randomUUID(),
          metadata: { tags: [], timestamp: Date.now() },
          role: 'player',
        },
        turnSequence: index,
      })
    );
  }
  return chronicle;
};

describe('turn window', () => {
  it('returns an inclusive sequence range in play order', async () => {
    const chronicle = await seedTurns(
      Array.from({ length: 5 }, (_, index) => ({
        gm: `Narration ${index}`,
        player: `Move ${index}`,
        summary: `Summary ${index}`,
      }))
    );
    const window = await worldState.chronicles.listTurnWindow({
      chronicleId: chronicle.id,
      fromSequence: 1,
      toSequence: 3,
    });
    expect(window.map((turn) => turn.turnSequence)).toEqual([1, 2, 3]);
  });

  it('returns the most recent turns in play order when no bounds are given', async () => {
    const chronicle = await seedTurns(
      Array.from({ length: 5 }, (_, index) => ({
        gm: `Narration ${index}`,
        player: `Move ${index}`,
        summary: `Summary ${index}`,
      }))
    );
    const tail = await worldState.chronicles.listTurnWindow({
      chronicleId: chronicle.id,
      limit: 2,
    });
    expect(tail.map((turn) => turn.turnSequence)).toEqual([3, 4]);
  });
});

describe('turn search', () => {
  it('finds turns by prose across player, summary, and gm content', async () => {
    const chronicle = await seedTurns([
      {
        gm: 'The gantry alarm echoes across the docks.',
        player: 'I climb the gantry.',
        summary: 'The character climbs toward the alarm.',
      },
      {
        gm: 'Korvath studies the tithe ledger in silence.',
        player: 'I ask Korvath about the tithe.',
        summary: 'A tense exchange over the missing tithe.',
      },
      {
        gm: 'Rain sweeps the empty market.',
        player: 'I wait out the storm.',
        summary: 'A quiet interlude in the market.',
      },
    ]);
    const hits = await worldState.chronicles.searchTurns({
      chronicleId: chronicle.id,
      query: 'tithe ledger',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.turnSequence).toBe(1);
  });

  it('does not match turns from other chronicles', async () => {
    await seedTurns([
      {
        gm: 'The sluice gates grind open.',
        player: 'I open the sluice gates.',
        summary: 'The gates open.',
      },
    ]);
    const other = await worldState.chronicles.ensureChronicle({
      locationName: 'Another Locale',
      playerId: TEST_PLAYER_ID,
    });
    const hits = await worldState.chronicles.searchTurns({
      chronicleId: other.id,
      query: 'sluice gates',
    });
    expect(hits).toHaveLength(0);
  });
});

describe('prose alternates', () => {
  it('round-trips agent-panel narrations on the turn record', async () => {
    const chronicle = await worldState.chronicles.ensureChronicle({
      locationName: 'Alternates Locale',
      playerId: TEST_PLAYER_ID,
    });
    const alternates = [{
      costUsd: 0.0123,
      modelId: 'claude-sonnet-5',
      prose: 'The dockmaster narrows his eyes.',
      sidecar: [{ emergentTags: [], entityId: crypto.randomUUID(), usage: 'central' as const }],
      stepCount: 2,
      totalTokens: 900,
    }];
    await commitChronicleTurn(
      worldState,
      chronicle,
      defaultTurn(chronicle.id, {
        proseAlternates: alternates,
        proseCostUsd: 0.0041,
        turnSequence: 0,
      })
    );
    const [stored] = await worldState.chronicles.listChronicleTurns(chronicle.id);
    expect(stored?.proseAlternates).toEqual(alternates);
    expect(stored?.proseCostUsd).toBeCloseTo(0.0041, 6);
  });
});

describe('lore search', () => {
  it('ranks matching fragments and excludes DM-only entities', async () => {
    await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'geographic_location', name: 'The Glasshouse', ref: 'glasshouse' },
          { dm: true, kind: 'geographic_location', name: 'Hidden Vault', ref: 'vault' },
        ],
        lore: [
          {
            entity: { ref: 'glasshouse' },
            prose: 'Debts at the Glasshouse are settled in glass tokens.',
            title: 'Glasshouse debts',
          },
          {
            entity: { ref: 'glasshouse' },
            prose: 'The atrium stays warm through winter.',
            title: 'Atrium',
          },
          {
            entity: { ref: 'vault' },
            prose: 'Secret debts are recorded in the hidden vault.',
            title: 'Vault debts',
          },
        ],
      })
    );
    const hits = await worldState.world.searchLoreFragments({ query: 'debts' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Glasshouse debts');
  });

  it('falls back to OR matching when a multi-word query matches nothing conjunctively', async () => {
    await worldState.world.commitBatch(
      proposal({
        entities: [{ kind: 'geographic_location', name: 'The Tidebreak', ref: 'tidebreak' }],
        lore: [{
          entity: { ref: 'tidebreak' },
          prose: 'The seawall holds against every storm surge.',
          title: 'Seawall',
        }],
      })
    );
    const hits = await worldState.world.searchLoreFragments({ query: 'seawall lighthouse' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Seawall');
  });
});

describe('entity candidate search', () => {
  it('finds nearest entities globally while excluding DM-only entities', async () => {
    const result = await worldState.world.commitBatch(
      proposal({
        entities: [
          { kind: 'npc', name: 'Dockmaster Korvath', ref: 'korvath' },
          { dm: true, kind: 'npc', name: 'Hidden Broker', ref: 'broker' },
        ],
      })
    );
    const korvathId = result.entityIdsByRef.korvath;
    const brokerId = result.entityIdsByRef.broker;
    if (korvathId === undefined || brokerId === undefined) {
      throw new Error('Expected seeded entity refs to resolve.');
    }
    const near = [1, 0.5, ...Array.from({ length: 254 }, () => 0)];
    await worldState.world.saveEntityEmbedding(korvathId, near);
    await worldState.world.saveEntityEmbedding(brokerId, near);
    const candidates = await worldState.world.findEntityCandidates({ embedding: near });
    expect(candidates.map((candidate) => candidate.id)).toEqual([korvathId]);
    expect(candidates[0]?.similarity).toBeCloseTo(1, 5);
  });
});
