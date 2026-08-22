import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { CanonProposal, Turn } from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { ChronicleSnapshot, WorldSchemaStore } from '@glass-frontier/worldstate';
import { describe, expect, it, vi } from 'vitest';

import type { CanonExtraction } from '../src/canonHelpers';
import {
  buildRoster,
  derivedProminence,
  newEntityCap,
  sanitizeExtraction,
} from '../src/canonHelpers';
import { CanonPipeline } from '../src/canonPipeline';

const CHRONICLE_ID = 'chronicle-1';
const BRAKE_ID = 'entity-brake';
const KEL_ID = 'entity-kel';
const KEL_SLUG = 'warden_kel';
const TAVERN_NAME = 'The Rusted Anchor';

const turn = (overrides: Partial<Turn>): Turn => ({
  chronicleId: CHRONICLE_ID,
  failure: false,
  id: `turn-${overrides.turnSequence ?? 0}`,
  playerMessage: {
    content: 'A move is made',
    id: `message-${overrides.turnSequence ?? 0}`,
    metadata: { tags: [], timestamp: 1 },
    role: 'player',
  },
  turnSequence: 0,
  ...overrides,
});

const brakeSnippet = {
  id: BRAKE_ID,
  kind: 'installation',
  loreFragments: [],
  name: 'Brake',
  score: 1,
  slug: 'brake',
  tags: [],
};

const usageTurn = (sequence: number, usage: 'central' | 'mentioned' | 'unused'): Turn =>
  turn({
    entityOffered: [brakeSnippet],
    entityUsage: [
      {
        emergentTags: null,
        entityId: BRAKE_ID,
        entitySlug: 'brake',
        tags: [],
        usage,
      },
    ],
    turnSequence: sequence,
  });

describe('newEntityCap', () => {
  it('grants one entity per five turns within [3, 20]', () => {
    expect(newEntityCap(0)).toBe(3);
    expect(newEntityCap(25)).toBe(5);
    expect(newEntityCap(500)).toBe(20);
  });
});

describe('derivedProminence', () => {
  it('promotes on lore and edge thresholds and never demotes', () => {
    expect(derivedProminence('marginal', 1, 1)).toBe('marginal');
    expect(derivedProminence('marginal', 3, 0)).toBe('recognized');
    expect(derivedProminence('marginal', 0, 15)).toBe('renowned');
    expect(derivedProminence('renowned', 0, 0)).toBe('renowned');
    expect(derivedProminence('mythic', 9, 20)).toBe('mythic');
  });
});

describe('buildRoster', () => {
  it('ranks central entities first and skips unused or unknown ones', () => {
    const turns = [
      usageTurn(0, 'mentioned'),
      turn({
        entityOffered: [
          { ...brakeSnippet, id: KEL_ID, name: 'Warden Kel', slug: KEL_SLUG },
        ],
        entityUsage: [
          {
            emergentTags: null,
            entityId: KEL_ID,
            entitySlug: KEL_SLUG,
            tags: [],
            usage: 'central',
          },
          {
            emergentTags: null,
            entityId: 'entity-unknown',
            entitySlug: 'unknown',
            tags: [],
            usage: 'central',
          },
        ],
        turnSequence: 1,
      }),
      usageTurn(2, 'unused'),
    ];

    const roster = buildRoster(turns);

    expect(roster.map((entry) => entry.slug)).toEqual([KEL_SLUG, 'brake']);
    expect(roster[0]?.centralCount).toBe(1);
    expect(roster[1]?.mentionedCount).toBe(1);
  });
});

describe('sanitizeExtraction', () => {
  const roster = [
    {
      centralCount: 1,
      id: BRAKE_ID,
      kind: 'installation',
      mentionedCount: 0,
      name: 'Brake',
      slug: 'brake',
    },
    {
      centralCount: 0,
      id: KEL_ID,
      kind: 'npc',
      mentionedCount: 2,
      name: 'Warden Kel',
      slug: KEL_SLUG,
    },
  ];

  it('caps, dedupes, remaps roster names, and drops invalid subkinds and tags', () => {
    const extraction: CanonExtraction = {
      knownEntities: [
        {
          loreProse: 'The station held.',
          loreTags: ['governance', 'not-a-tag'],
          loreTitle: 'The Standoff',
          slug: 'brake',
        },
        {
          loreProse: 'Kel watched.',
          loreTags: [],
          loreTitle: 'Watching',
          slug: KEL_SLUG,
        },
      ],
      newEntities: [
        {
          isLocation: true,
          kind: 'installation',
          loreProse: 'Named on arrival.',
          loreTags: null,
          loreTitle: 'Arrival',
          name: 'Brake',
        },
        {
          isLocation: false,
          kind: 'artifact',
          loreProse: 'A sword was named.',
          loreTags: ['legend'],
          loreTitle: 'The Naming',
          name: 'Glasstooth',
          subkind: 'settlement',
        },
        {
          isLocation: false,
          kind: 'artifact',
          loreProse: 'Duplicate.',
          loreTags: [],
          loreTitle: 'Duplicate',
          name: 'glasstooth',
        },
        {
          isLocation: false,
          kind: 'npc',
          loreProse: 'Over cap.',
          loreTags: [],
          loreTitle: 'Over Cap',
          name: 'Overflow',
          subkind: 'courier',
        },
      ],
    };

    const { candidates, knownLore } = sanitizeExtraction(extraction, roster, 1);

    expect(knownLore.map((entry) => entry.roster.slug)).toEqual(['brake']);
    expect(knownLore[0]?.loreTags).toEqual(['governance']);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.name).toBe('Glasstooth');
    expect(candidates[0]?.subkind).toBeUndefined();
  });
});

describe('CanonPipeline', () => {
  const player = { id: 'player-1', isAdmin: false, name: 'tsonu' };

  const snapshot = {
    character: null,
    chronicle: {
      beats: [],
      beatsEnabled: true,
      entityFocus: { entityScores: {}, tagScores: {} },
      id: CHRONICLE_ID,
      locationName: 'Brake',
      openingText: '',
      playerId: 'player-1',
      status: 'closed',
      summaries: [],
      title: 'Quarantine Quartet',
      toneChips: [],
      toneNotes: '',
    },
    chronicleId: CHRONICLE_ID,
    locationName: 'Brake',
    turns: [usageTurn(0, 'central')],
    turnSequence: 0,
  } as unknown as ChronicleSnapshot;

  const extraction: CanonExtraction = {
    knownEntities: [
      {
        loreProse: 'Brake weathered the quarantine.',
        loreTags: ['governance'],
        loreTitle: 'The Quarantine',
        slug: 'brake',
      },
    ],
    newEntities: [
      {
        isLocation: true,
        kind: 'installation',
        loreProse: 'The crew took refuge in the tavern.',
        loreTags: ['founding'],
        loreTitle: 'Refuge',
        name: TAVERN_NAME,
        relationships: [{ relationship: 'located_in', target: 'brake' }],
        subkind: 'landmark',
      },
    ],
  };

  const createMocks = (): {
    commitBatch: ReturnType<typeof vi.fn>;
    findBatch: ReturnType<typeof vi.fn>;
    pipeline: CanonPipeline;
  } => {
    const commitBatch = vi.fn().mockResolvedValue({
      batchId: 'batch-1',
      entityCount: 1,
      entityIdsByRef: {},
      loreCount: 2,
      relationshipCount: 1,
    });
    const findBatch = vi.fn().mockResolvedValue(null);
    const worldStore = {
      commitBatch,
      findBatch,
      findEntitiesByName: vi.fn().mockResolvedValue([]),
      listEntitiesByIds: vi.fn().mockResolvedValue([]),
      listEntityStats: vi
        .fn()
        .mockResolvedValue([
          { edgeCount: 0, id: BRAKE_ID, loreCount: 0, source: 'seed' },
        ]),
      listLoreFragmentsByEntities: vi.fn().mockResolvedValue(new Map()),
    } as unknown as WorldSchemaStore;
    const llmClient = {
      generate: vi.fn().mockResolvedValue({ message: 'A weathered dockside tavern on Brake.' }),
      generateStructured: vi.fn().mockResolvedValue({ data: extraction }),
    } as unknown as RetryLLMClient;
    const pipeline = new CanonPipeline({
      llmClient,
      modelConfigStore: {
        getModelForCategory: vi.fn().mockResolvedValue('gpt-5.6-luna'),
      } as unknown as ModelConfigStore,
      templateManager: {
        resolveTemplate: vi
          .fn()
          .mockResolvedValue({ body: 'instructions', variantId: 'official' }),
      } as unknown as PromptTemplateManager,
      worldStore,
    });
    return { commitBatch, findBatch, pipeline };
  };

  it('commits one play batch with the shell entity, lore, and edges', async () => {
    const { commitBatch, pipeline } = createMocks();

    await pipeline.run(snapshot, player);

    expect(commitBatch).toHaveBeenCalledOnce();
    const proposal = commitBatch.mock.calls[0]?.[0] as CanonProposal;
    expect(proposal.source).toBe('play');
    expect(proposal.sourceId).toBe(CHRONICLE_ID);
    expect(proposal.entities).toHaveLength(1);
    expect(proposal.entities[0]).toMatchObject({
      description: 'A weathered dockside tavern on Brake.',
      externalKey: 'chronicle:chronicle-1:the_rusted_anchor',
      isLocation: true,
      kind: 'installation',
      name: TAVERN_NAME,
      prominence: 'marginal',
      ref: TAVERN_NAME,
      subkind: 'landmark',
    });
    expect(proposal.lore).toHaveLength(2);
    expect(proposal.lore[0]).toMatchObject({
      entity: { id: BRAKE_ID },
      externalKey: 'chronicle:chronicle-1:lore:brake',
      title: 'The Quarantine',
    });
    expect(proposal.lore[1]).toMatchObject({
      entity: { ref: TAVERN_NAME },
      externalKey: 'chronicle:chronicle-1:lore:the_rusted_anchor',
      title: 'Refuge',
    });
    expect(proposal.relationships).toEqual([
      {
        dst: { id: BRAKE_ID },
        relationship: 'located_in',
        src: { ref: TAVERN_NAME },
      },
    ]);
  });

  it('does nothing when the chronicle already has a play batch', async () => {
    const { commitBatch, findBatch, pipeline } = createMocks();
    findBatch.mockResolvedValue({ batchId: 'batch-existing' });

    await pipeline.run(snapshot, player);

    expect(commitBatch).not.toHaveBeenCalled();
  });
});
