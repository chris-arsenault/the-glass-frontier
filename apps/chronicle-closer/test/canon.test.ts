import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { CanonProposal, Turn } from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { ChronicleSnapshot, WorldSchemaStore } from '@glass-frontier/worldstate';
import { describe, expect, it, vi } from 'vitest';

import type { CanonExtraction } from '../src/canonHelpers';
import {
  buildRoster,
  collectScenes,
  derivedProminence,
  newEntityCap,
  sanitizeExtraction,
} from '../src/canonHelpers';
import { CanonPipeline } from '../src/canonPipeline';
import { buildProposalPlan } from '../src/canonProposalBuilder';

const CHRONICLE_ID = 'chronicle-1';
const BRAKE_ID = 'entity-brake';
const KEL_ID = 'entity-kel';
const KEL_NAME = 'Warden Kel';
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
          { ...brakeSnippet, id: KEL_ID, name: KEL_NAME, slug: KEL_SLUG },
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

describe('collectScenes', () => {
  it('dedupes by sceneId, tracks the final outcome, and includes the open scene', () => {
    const turns = [
      turn({
        sceneContext: {
          outcome: 'continue',
          sceneId: 'scene-1',
          subject: KEL_NAME,
          subjectKind: 'npc',
          type: 'dialog',
        },
        turnSequence: 0,
      }),
      turn({
        sceneContext: {
          outcome: 'complete',
          sceneId: 'scene-1',
          subject: KEL_NAME,
          subjectKind: 'npc',
          type: 'dialog',
        },
        turnSequence: 1,
      }),
    ];

    const scenes = collectScenes(turns, {
      id: 'scene-2',
      startedAtTurn: 2,
      subject: TAVERN_NAME,
      subjectKind: 'installation',
      type: 'search',
    });

    expect(scenes).toEqual([
      {
        firstTurn: 0,
        lastTurn: 1,
        outcome: 'complete',
        subject: KEL_NAME,
        subjectKind: 'npc',
        type: 'dialog',
      },
      {
        firstTurn: 2,
        lastTurn: 2,
        outcome: 'continue',
        subject: TAVERN_NAME,
        subjectKind: 'installation',
        type: 'search',
      },
    ]);
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
      name: KEL_NAME,
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

    const { candidates, drops, knownLore } = sanitizeExtraction(extraction, roster, 1);

    expect(knownLore.map((entry) => entry.roster.slug)).toEqual(['brake']);
    expect(knownLore[0]?.loreTags).toEqual(['governance']);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.name).toBe('Glasstooth');
    expect(candidates[0]?.subkind).toBeUndefined();
    expect(drops).toEqual(
      expect.arrayContaining([
        { reason: 'not_eligible_for_lore', stage: 'known_lore', subject: KEL_SLUG },
        { reason: 'duplicate_name', stage: 'new_entity', subject: 'glasstooth' },
        { reason: 'over_cap: 1', stage: 'new_entity', subject: 'Overflow' },
        {
          reason: 'invalid_subkind_removed: settlement (kind artifact)',
          stage: 'new_entity',
          subject: 'Glasstooth',
        },
      ])
    );
  });

  it('makes a scene subject eligible for lore without a central turn', () => {
    const extraction: CanonExtraction = {
      knownEntities: [
        {
          loreProse: 'Kel bargained through the standoff.',
          loreTags: [],
          loreTitle: 'The Bargain',
          slug: KEL_SLUG,
        },
      ],
      newEntities: [],
    };

    const withoutScene = sanitizeExtraction(extraction, roster, 5);
    const withScene = sanitizeExtraction(extraction, roster, 5, new Set(['warden kel']));

    expect(withoutScene.knownLore).toHaveLength(0);
    expect(withScene.knownLore.map((entry) => entry.roster.slug)).toEqual([KEL_SLUG]);
  });
});

describe('buildProposalPlan', () => {
  it('records why each relationship was dropped', () => {
    const plan = buildProposalPlan({
      candidates: [
        {
          isLocation: false,
          kind: 'npc',
          loreProse: 'They arrived.',
          loreTags: [],
          loreTitle: 'Arrival',
          name: 'Named One',
          relationships: [
            { relationship: 'member_of', target: 'nowhere' },
            { relationship: 'member_of', target: 'Named One' },
          ],
          subkind: undefined,
        },
      ],
      chronicleId: CHRONICLE_ID,
      knownLore: [],
      resolutions: new Map([['named one', { action: 'create' as const }]]),
      roster: [],
    });

    expect(plan.relationships).toHaveLength(0);
    expect(plan.proposedRelationshipCount).toBe(2);
    expect(plan.drops.map((drop) => drop.reason)).toEqual(['target_not_found', 'self_edge']);
    expect(plan.drops[0]?.subject).toBe('Named One -[member_of]-> nowhere');
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
    turns: [
      {
        ...usageTurn(0, 'central'),
        sceneContext: {
          outcome: 'complete',
          sceneId: 'scene-1',
          subject: TAVERN_NAME,
          subjectKind: 'installation',
          type: 'search',
        },
      },
    ],
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
    generateStructured: ReturnType<typeof vi.fn>;
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
    const generateStructured = vi.fn().mockResolvedValue({ data: extraction });
    const llmClient = {
      generate: vi.fn().mockResolvedValue({ message: 'A weathered dockside tavern on Brake.' }),
      generateStructured,
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
    return { commitBatch, findBatch, generateStructured, pipeline };
  };

  it('commits one play batch with the shell entity, lore, and edges', async () => {
    const { commitBatch, generateStructured, pipeline } = createMocks();

    await pipeline.run(snapshot, player);

    const extractRequest = generateStructured.mock.calls[0]?.[0] as {
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(extractRequest.input[1]?.content[0]?.text).toContain('"scenes"');
    expect(extractRequest.input[1]?.content[0]?.text).toContain(TAVERN_NAME);
    expect(extractRequest.input[2]?.content[0]?.text).toContain('Scene: search');

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
