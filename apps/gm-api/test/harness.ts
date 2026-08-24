import type { Intent } from '@glass-frontier/dto';

import { ChronicleTelemetry } from '../src/telemetry';
import type { GraphContext } from '../src/types';

export const telemetry = new ChronicleTelemetry();

export const buildIntent = (overrides?: Partial<Intent>): Intent => ({
  beatDirective: {
    kind: 'independent',
    summary: 'No beat directive assigned.',
    targetBeatId: null,
  },
  creativeSpark: false,
  handlerHints: [],
  intentSummary: 'Pry the access panel open.',
  intentType: 'action',
  metadata: { tags: [], timestamp: 0 },
  routerRationale: 'Concrete verb aimed at the world.',
  sceneChange: null,
  tone: 'tense',
  ...overrides,
});

export const buildContext = (overrides?: Partial<GraphContext>): GraphContext => ({
  advancesTimeline: false,
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
        cultureId: '22222222-2222-4222-8222-222222222222',
        homelandId: '33333333-3333-4333-8333-333333333333',
        speciesId: '44444444-4444-4444-8444-444444444444',
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
      beats: [],
      entityFocus: { entityScores: {}, tagScores: {} },
      entityRoster: {
        entries: [],
        locationName: 'The Splinter Yards',
        sceneId: null,
        updatedAtTurn: 0,
      },
      seedText: 'A derelict relay station hums back to life.',
      toneChips: [],
      toneNotes: '',
    },
    chronicleId: 'chronicle-1',
    locationName: 'The Splinter Yards',
    turns: [],
    turnSequence: 0,
  } as unknown as GraphContext['chronicleState'],
  chronicleStore: {} as GraphContext['chronicleStore'],
  effectiveScene: null,
  embeddings: {
    embed: () => Promise.resolve([]),
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
  sceneOutcome: 'continue',
  sceneOutcomeReason: null,
  shouldCloseChronicle: false,
  targetEntityIds: [],
  telemetry,
  templates: {} as GraphContext['templates'],
  turnId: 'turn-1',
  turnSequence: 1,
  worldSchemaStore: {
    listEntitiesByIds: (ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, name: `entity-${id.slice(0, 4)}` }))),
  } as unknown as GraphContext['worldSchemaStore'],
  ...overrides,
});
