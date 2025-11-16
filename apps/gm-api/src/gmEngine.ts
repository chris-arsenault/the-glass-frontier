import type { LocationContext, TranscriptEntry, Turn } from '@glass-frontier/worldstate';

import type { GraphContext, GraphNode } from './engine/graphNode';
import { GraphOrchestrator } from './engine/graphOrchestrator';
import {
  BeatDetectorNode,
  BeatTrackerNode,
  CheckPlannerNode,
  GmSummaryNode,
  IntentClassifierNode,
  SkillDetectorNode,
} from './engine/nodes/classifiers';
import { InventoryDeltaNode, LocationDeltaNode } from './engine/nodes/deltaClassifiers';
import { createIntentHandlers } from './engine/nodes/intentHandlers';
import { NoopStructuredLlmClient, type StructuredLlmClient } from './engine/nodes/structuredLlmClient';
import { UpdateCharacterNode } from './engine/nodes/UpdateCharacterNode';
import type { WorldstateSession, WorldstateSessionSummary } from './worldstateSession';

export type ProcessPlayerTurnOptions = {
  authorizationHeader?: string;
  chronicleId: string;
  playerMessage: TranscriptEntry;
  session: WorldstateSession;
};

export type ProcessPlayerTurnResult = {
  chronicleId: string;
  message: string;
  session: WorldstateSessionSummary;
};

type GmEngineDependencies = {
  llmClient: StructuredLlmClient;
};

type EngineEffects = {
  turn?: Turn;
  location?: {
    locationContext?: LocationContext;
  };
};

export class GmEngine {
  readonly #llmClient: StructuredLlmClient;
  readonly #orchestrator: GraphOrchestrator;

  constructor(deps?: Partial<GmEngineDependencies>) {
    this.#llmClient = deps?.llmClient ?? new NoopStructuredLlmClient();
    this.#orchestrator = new GraphOrchestrator(this.#buildNodes());
  }

  async processPlayerTurn(options: ProcessPlayerTurnOptions): Promise<ProcessPlayerTurnResult> {
    const context = await this.#orchestrator.run(this.#buildContext(options));
    await this.#persistResults(context);
    return {
      chronicleId: options.chronicleId,
      message: context.turnDraft.gmSummary ?? 'Turn processed',
      session: options.session.describe(),
    };
  }

  #buildNodes(): GraphNode[] {
    return [
      new IntentClassifierNode(this.#llmClient),
      new SkillDetectorNode(this.#llmClient),
      new BeatDetectorNode(this.#llmClient),
      new CheckPlannerNode(this.#llmClient),
      ...createIntentHandlers(this.#llmClient),
      new GmSummaryNode(this.#llmClient),
      new BeatTrackerNode(this.#llmClient),
      new InventoryDeltaNode(this.#llmClient),
      new LocationDeltaNode(this.#llmClient),
      new UpdateCharacterNode(),
    ];
  }

  #buildContext(options: ProcessPlayerTurnOptions): GraphContext {
    const chronicle = options.session.chronicle;
    return {
      beats: chronicle.beats ?? [],
      character: options.session.character,
      chronicle,
      chronicleId: chronicle.id,
      effects: {},
      failure: false,
      locationSummary: null,
      playerMessage: options.playerMessage,
      session: options.session,
      turnDraft: {
        playerMessage: options.playerMessage,
      },
      turnSequence: options.session.nextTurnSequence,
    };
  }

  async #persistResults(context: GraphContext): Promise<void> {
    const turn = this.#resolveTurn(context);
    await context.session.store.appendTurn(turn.chronicleId, turn);

    const locationContext = this.#getEffects(context).location?.locationContext;
    if (
      locationContext !== undefined &&
      locationContext !== null &&
      typeof locationContext.locationId === 'string' &&
      locationContext.locationId.length > 0 &&
      typeof locationContext.placeId === 'string' &&
      locationContext.placeId.length > 0
    ) {
      await context.session.store.updateLocationState({
        certainty: locationContext.certainty ?? 1,
        characterId: turn.characterId,
        locationId: locationContext.locationId,
        placeId: locationContext.placeId,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  #resolveTurn(context: GraphContext): Turn {
    const effects = this.#getEffects(context);
    if (effects.turn !== undefined) {
      return effects.turn;
    }
    const draft = context.turnDraft;
    if (this.#isTurnRecord(draft)) {
      return draft;
    }
    throw new Error('GM engine did not produce a turn payload');
  }

  #getEffects(context: GraphContext): EngineEffects {
    return (context.effects ?? {}) as EngineEffects;
  }

  #isTurnRecord(candidate: Partial<Turn>): candidate is Turn {
    return (
      typeof candidate.chronicleId === 'string' &&
      candidate.chronicleId.length > 0 &&
      typeof candidate.characterId === 'string' &&
      candidate.characterId.length > 0 &&
      typeof candidate.loginId === 'string' &&
      candidate.loginId.length > 0 &&
      typeof candidate.createdAt === 'string' &&
      candidate.createdAt.length > 0
    );
  }
}
