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
    },
    chronicle: {
      beats: [],
      beatsEnabled: true,
      entityFocus: { entityScores: {}, tagScores: {} },
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
  failure: false,
  llm: {} as GraphContext['llm'],
  modelConfigStore: {} as GraphContext['modelConfigStore'],
  playerIntent: undefined,
  playerMessage: {
    content: 'I pry the access panel open.',
    id: 'msg-1',
    metadata: { tags: [], timestamp: 0 },
    role: 'player',
  },
  shouldCloseChronicle: false,
  telemetry,
  templates: {} as GraphContext['templates'],
  turnId: 'turn-1',
  turnSequence: 1,
  worldSchemaStore: {} as GraphContext['worldSchemaStore'],
  ...overrides,
});
