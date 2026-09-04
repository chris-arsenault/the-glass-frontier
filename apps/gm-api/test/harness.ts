import type { EncyclopediaEntry, Intent } from '@glass-frontier/dto';

import { ChronicleTelemetry } from '../src/telemetry';
import type { GraphContext } from '../src/types';

export const telemetry = new ChronicleTelemetry();

const originEntry = (id: string): EncyclopediaEntry & { id: string } => ({
  aliases: [],
  descriptiveIdentity: {},
  dm: false,
  externalKey: `test:${id}`,
  facts: {},
  id,
  instances: [],
  kind: 'people',
  members: [],
  prevalence: 'common',
  sections: [],
  slug: `origin-${id.slice(0, 4)}`,
  status: 'complete',
  subkind: 'origin',
  summary: 'A test origin.',
  tiers: [],
  title: `Origin ${id.slice(0, 4)}`,
  topics: [],
  usage: { affordances: [], cues: [], pressures: [], variations: [] },
});

export const buildIntent = (overrides?: Partial<Intent>): Intent => ({
  creativeSpark: false,
  intentSummary: 'Pry the access panel open.',
  intentType: 'action',
  metadata: { tags: [], timestamp: 0 },
  scene: { action: 'continue' },
  thread: { action: 'keep' },
  ...overrides,
});

export const buildContext = (overrides?: Partial<GraphContext>): GraphContext => ({
  advancesTimeline: false,
  agentLoop: {} as GraphContext['agentLoop'],
  chronicleId: 'chronicle-1',
  chronicleState: {
    character: {
      inventory: [],
      name: 'Vex',
      nature: {
        callings: ['Find the tuner who taught them', 'Pay off the Wardens'],
        drive: 'Be heard by someone who matters',
        flaw: 'Plays for the room instead of the job',
        instinct: 'When a crowd turns, they start playing',
        uniqueThing: 'The last person to hear the drowned choir and walk away',
      },
      origin: {
        allegianceId: '11111111-1111-4111-8111-111111111111',
        allegianceStance: 'indebted',
        cultureReferenceId: '22222222-2222-4222-8222-222222222222',
        homelandId: '33333333-3333-4333-8333-333333333333',
        speciesReferenceId: '44444444-4444-4444-8444-444444444444',
      },
      skills: {
        hold_a_hostile_room: {
          attribute: 'presence',
          name: 'hold a hostile room',
          tier: 'artisan',
          xp: 0,
        },
      },
    },
    chronicle: {
      activeScene: null,
      entityFocus: { entityScores: {}, tagScores: {} },
      entityRoster: {
        entries: [],
        locationName: 'The Splinter Yards',
        sceneId: null,
        updatedAtTurn: 0,
      },
      focusedThreadId: null,
      localContinuity: null,
      seedText: 'A derelict relay station hums back to life.',
      threads: [],
      toneChips: [],
      toneNotes: '',
    },
    chronicleId: 'chronicle-1',
    locationName: 'The Splinter Yards',
    turns: [],
    turnSequence: 0,
  } as unknown as GraphContext['chronicleState'],
  chronicleStore: {
    listTurnWindow: () => Promise.resolve([]),
    searchTurns: () => Promise.resolve([]),
  } as unknown as GraphContext['chronicleStore'],
  effectiveFocusedThreadId: null,
  effectiveScene: null,
  effectiveThreads: [],
  embeddings: {
    embed: () => Promise.resolve([]),
  },
  encyclopediaStore: {
    findCandidates: () => Promise.resolve([]),
    findMentionedEntries: () => Promise.resolve([]),
    getEntry: () => Promise.resolve(null),
    getEntryById: (id: string) => Promise.resolve(originEntry(id)),
    listApplicable: () => Promise.resolve([]),
    listAtlasExamplesForEntry: () => Promise.resolve([]),
    listCharacterOptions: () => Promise.resolve([]),
    listClassificationsForEntity: () => Promise.resolve([]),
    listEntries: () => Promise.resolve([]),
    listMissingEmbeddings: () => Promise.resolve([]),
    saveEmbedding: () => Promise.resolve(),
  },
  failure: false,
  llm: {} as GraphContext['llm'],
  llmPlayer: { id: 'player-1', isAdmin: false, name: 'tsonu' },
  modelConfigStore: {} as GraphContext['modelConfigStore'],
  playerIntent: undefined,
  playerMessage: {
    content: 'I pry the access panel open.',
    id: 'msg-1',
    metadata: { tags: [], timestamp: 0 },
    role: 'player',
  },
  sceneBoundary: false,
  sceneWillClose: false,
  targetEntityIds: [],
  telemetry,
  templates: {} as GraphContext['templates'],
  turnId: 'turn-1',
  turnSequence: 1,
  worldSchemaStore: {
    findLocationByName: () => Promise.resolve(null),
    listEntitiesByIds: (ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, name: `entity-${id.slice(0, 4)}` }))),
  } as unknown as GraphContext['worldSchemaStore'],
  ...overrides,
  directEncyclopediaEntries: overrides?.directEncyclopediaEntries ?? [],
  playerReferenceSlugs: overrides?.playerReferenceSlugs ?? [],
});
