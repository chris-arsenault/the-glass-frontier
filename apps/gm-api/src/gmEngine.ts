import type { PromptTemplateManager, ModelConfigStore } from '@glass-frontier/app';
import { PromptTemplateRuntime } from '@glass-frontier/app';
import type {
  Character,
  TranscriptEntry,
  Turn,
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
} from '@glass-frontier/dto';
import { CheckRunnerNode } from '@glass-frontier/gm-api/gmGraph/nodes/CheckRunnerNode';
import { CheckPlannerNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/CheckPlannerNode';
import { EntityJudgeNode, EntitySelectorNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/EntityNodes';
import { GmSummaryNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/GmSummaryNode';
import { InventoryDeltaNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/InventoryDeltaNode';
import { LocationDeltaNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/LocationDeltaNode';
import { GmResponseNode } from '@glass-frontier/gm-api/gmGraph/nodes/IntentHandlerNodes';
import { WorldUpdater } from '@glass-frontier/gm-api/updaters/WorldUpdater';
import type { LLMPlayer, RetryLLMClient } from '@glass-frontier/llm-client';
import { formatTurnJobId, isDefined, isNonEmptyString, log } from '@glass-frontier/utils';
import {
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import {
  type ChronicleClosurePublisher,
  createClosureEmitterFromEnv
} from './eventEmitters/closureEmitter';
import { type TurnProgressPublisher } from './eventEmitters/progressEmitter';
import { createProgressEmitterFromEnv } from './eventEmitters/progressEmitter';
import { BeatDetectorNode } from './gmGraph/nodes/classifiers/BeatDetectorNode';
import { BeatTrackerNode } from './gmGraph/nodes/classifiers/BeatTrackerNode';
import { IntentClassifierNode } from './gmGraph/nodes/classifiers/IntentClassifierNode';
import { GmGraphOrchestrator } from './gmGraph/orchestrator';
import { buildSceneContext } from './scenes/sceneLifecycle';
import { ChronicleTelemetry } from './telemetry';
import type { GraphContext, ChronicleState } from './types';

type GmEngineOptions = {
  chronicleStore: ChronicleStore;
  worldSchemaStore: WorldSchemaStore;
  templateManager: PromptTemplateManager;
  llmClient: RetryLLMClient;
  modelConfigStore: ModelConfigStore;
};

const CLOSURE_SUMMARY_KINDS: ChronicleSummaryKind[] = ['chronicle_story', 'character_bio'];

class GmEngine {
  readonly chronicleStore: ChronicleStore;
  readonly worldSchemaStore: WorldSchemaStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: GmGraphOrchestrator;
  readonly llm: RetryLLMClient;
  readonly progressEmitter: TurnProgressPublisher;
  readonly closureEmitter: ChronicleClosurePublisher;
  readonly templateManager: PromptTemplateManager;
  readonly modelConfigStore: ModelConfigStore;

  constructor(options: GmEngineOptions) {
    this.templateManager = options.templateManager;
    this.chronicleStore = options.chronicleStore;
    this.worldSchemaStore = options.worldSchemaStore;
    this.telemetry = new ChronicleTelemetry();
    this.llm = options.llmClient;
    this.modelConfigStore = options.modelConfigStore;
    this.progressEmitter = createProgressEmitterFromEnv();
    this.closureEmitter = createClosureEmitterFromEnv();
    this.graph = this.#createGraph();
  }

  /* eslint-disable-next-line max-lines-per-function */
  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    requestId: string,
    llmPlayer: LLMPlayer,
  ): Promise<{
    turn: Turn;
    updatedCharacter: Character | null;
    locationName: string;
    chronicleStatus: Chronicle['status'];
    beats: Chronicle['beats'];
    entityFocus: Chronicle['entityFocus'];
    activeScene: Chronicle['activeScene'];
  }> {
    this.#assertChronicleId(chronicleId);
    const chronicleState = await this.#loadChronicleState(chronicleId);
    this.#ensureChronicleOpen(chronicleState);
    const turnSequence = chronicleState.turnSequence + 1;
    const turnId = randomUUID();
    const playerId = this.#requirePlayerId(chronicleState);
    if (llmPlayer.id !== playerId) {
      throw new Error('Authenticated player does not own this chronicle.');
    }
    const jobId = formatTurnJobId(chronicleId, turnSequence, requestId);
    const templateRuntime = this.#createTemplateRuntime(playerId);
    const graphInput = this.#buildGraphInput({
      chronicleId,
      chronicleState,
      chronicleStore: this.chronicleStore,
      llmPlayer,
      playerMessage,
      templateRuntime,
      turnId,
      turnSequence,
      worldSchemaStore: this.worldSchemaStore,
    });
    const { result: graphResult, systemMessage } = await this.#executeGraph(graphInput, jobId);
    const worldUpdater = new WorldUpdater();
    const updatedContext = await worldUpdater.update(graphResult);
    const targetEndTurn = updatedContext.chronicleState.chronicle.targetEndTurn;
    const wrapTargetReached =
      typeof targetEndTurn === 'number' &&
      turnSequence >= targetEndTurn &&
      !updatedContext.failure;
    const shouldClose =
      (updatedContext.shouldCloseChronicle || wrapTargetReached) &&
      updatedContext.chronicleState.chronicle.status !== 'closed';
    const finalContext: GraphContext = shouldClose
      ? {
        ...updatedContext,
        chronicleState: {
          ...updatedContext.chronicleState,
          chronicle: {
            ...updatedContext.chronicleState.chronicle,
            activeScene: null,
            status: 'closed',
          },
        },
        sceneOutcome: 'complete',
      }
      : updatedContext;

    const turn = this.#buildTurn({
      chronicleId,
      graphResult: finalContext,
      playerMessage,
      systemMessage,
      turnId,
      turnSequence,
    });

    if (shouldClose) {
      await this.#emitClosureEvent({
        chronicle: finalContext.chronicleState.chronicle,
        closingTurnSequence: turn.turnSequence,
        llmPlayer,
      });
    }

    await this.chronicleStore.commitTurn({
      character: finalContext.chronicleState.character,
      chronicle: finalContext.chronicleState.chronicle,
      turn,
    });

    log('info', 'Narrative engine resolved turn', {
      checkIssued: Boolean(graphResult.skillCheckPlan),
      chronicleId,
    });

    const updatedCharacter = finalContext.chronicleState.character ?? null;
    const locationName = finalContext.chronicleState.locationName;
    const chronicleStatus = finalContext.chronicleState.chronicle.status;
    const beats = finalContext.chronicleState.chronicle.beats;
    const entityFocus = finalContext.chronicleState.chronicle.entityFocus;
    const activeScene = finalContext.chronicleState.chronicle.activeScene;

    return {
      activeScene,
      beats,
      chronicleStatus,
      entityFocus,
      locationName,
      turn,
      updatedCharacter,
    };
  }

  #createGraph(): GmGraphOrchestrator {
    const intentClassifier = new IntentClassifierNode();
    const entitySelector = new EntitySelectorNode();
    const beatDetector = new BeatDetectorNode();
    const beatTracker = new BeatTrackerNode();
    const checkPlanner = new CheckPlannerNode();
    const gmSummaryNode = new GmSummaryNode();
    const checkRunner = new CheckRunnerNode();
    const gmResponseNode = new GmResponseNode();
    const entityJudgeNode = new EntityJudgeNode();
    const locationDeltaNode = new LocationDeltaNode();
    const inventoryDeltaNode = new InventoryDeltaNode();

    // All nodes that can be executed
    const nodes = [
      intentClassifier,
      beatDetector,
      checkPlanner,
      entitySelector,
      checkRunner,
      gmResponseNode,
      entityJudgeNode,
      beatTracker,
      gmSummaryNode,
      locationDeltaNode,
      inventoryDeltaNode,
    ];

    // Canonical execution pipeline - defines the exact order and parallelism
    const pipeline = [
      { nodeId: 'intent-classifier', type: 'sequential' as const },
      { nodeIds: ['intent-beat-detector', 'check-planner'], type: 'parallel' as const },
      { nodeId: 'entity-selector', type: 'sequential' as const },
      { nodeId: 'check-runner', type: 'sequential' as const },
      { nodeId: 'gm-response-node', type: 'sequential' as const },
      { nodeIds: ['entity-judge', 'beat-tracker', 'gm-summary', 'inventory-delta', 'location-delta'], type: 'parallel' as const },
    ];

    return new GmGraphOrchestrator(
      nodes,
      pipeline,
      this.telemetry,
      { progressEmitter: this.progressEmitter }
    );
  }

  #assertChronicleId(chronicleId: string): void {
    if (!isNonEmptyString(chronicleId)) {
      throw new Error('chronicleId is required');
    }
  }

  async #loadChronicleState(chronicleId: string): Promise<ChronicleState> {
    const state = await this.chronicleStore.getChronicleState(chronicleId);
    if (!isDefined(state)) {
      throw new Error(`Chronicle ${chronicleId} not found`);
    }
    const { character } = state;
    if (character === null) {
      throw new Error(`Chronicle ${chronicleId} has no session character state`);
    }
    return { ...state, character };
  }

  #requirePlayerId(state: ChronicleState): string {
    const playerId = state.chronicle?.playerId;
    if (!isNonEmptyString(playerId)) {
      throw new Error('Chronicle state missing player identifier for template resolution');
    }
    return playerId.trim();
  }

  #createTemplateRuntime(playerId: string): PromptTemplateRuntime {
    return new PromptTemplateRuntime({
      manager: this.templateManager,
      playerId,
    });
  }

  #ensureChronicleOpen(state: ChronicleState): void {
    if (state.chronicle?.status === 'closed') {
      throw new Error('Chronicle is closed.');
    }
  }

  #buildGraphInput({
    chronicleId,
    chronicleState,
    chronicleStore,
    llmPlayer,
    playerMessage,
    templateRuntime,
    turnId,
    turnSequence,
    worldSchemaStore,
  }: {
    authorizationHeader?: string;
    chronicleId: string;
    turnId: string;
    chronicleState: ChronicleState;
    playerMessage: TranscriptEntry;
    templateRuntime: PromptTemplateRuntime;
    turnSequence: number;
    chronicleStore: ChronicleStore;
    llmPlayer: LLMPlayer;
    worldSchemaStore: WorldSchemaStore;
  }): GraphContext {
    return {
      advancesTimeline: false,
      chronicleId,
      chronicleState,
      chronicleStore,
      effectiveScene: chronicleState.chronicle.activeScene,
      failure: false,
      llm: this.llm,
      llmPlayer,
      modelConfigStore: this.modelConfigStore,
      playerIntent: undefined,
      playerMessage,
      sceneOutcome: 'continue',
      sceneOutcomeReason: null,
      shouldCloseChronicle: false,
      telemetry: this.telemetry,
      templates: templateRuntime,
      turnId,
      turnSequence,
      worldSchemaStore,
    };
  }

  async #executeGraph(
    input: GraphContext,
    jobId: string
  ): Promise<{ result: GraphContext; systemMessage?: TranscriptEntry }> {
    try {
      const result = await this.graph.run(input, { jobId });
      return { result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      log('error', 'Narrative engine failed during graph execution', {
        chronicleId: input.chronicleId,
        message,
      });
      return {
        result: { ...input, failure: true },
        systemMessage: this.#buildSystemErrorEntry(message),
      };
    }
  }

  #buildSystemErrorEntry(message: string): TranscriptEntry {
    return {
      content: message,
      id: randomUUID(),
      metadata: {
        tags: ['system-failure'],
        timestamp: Date.now(),
      },
      role: 'system',
    };
  }

  #buildTurn({
    chronicleId,
    graphResult,
    playerMessage,
    systemMessage,
    turnId,
    turnSequence,
  }: {
    chronicleId: string;
    turnId: string;
    graphResult: GraphContext;
    playerMessage: TranscriptEntry;
    systemMessage?: TranscriptEntry;
    turnSequence: number;
  }): Turn {
    const failure = graphResult.failure || systemMessage !== undefined;
    const governingScene = failure
      ? graphResult.chronicleState.chronicle.activeScene
      : graphResult.effectiveScene;
    return {
      advancesTimeline: graphResult.advancesTimeline,
      beatTracker: graphResult.beatTracker,
      chronicleId,
      entityOffered: graphResult.entityContext?.offered,
      entityUsage: graphResult.entityUsage,
      executedNodes: graphResult.executedNodes,
      failure,
      gmResponse: graphResult.gmResponse,
      gmSummary: graphResult.gmSummary,
      gmTrace: graphResult.gmTrace === null ? undefined : graphResult.gmTrace,
      id: turnId,
      inventoryDelta: graphResult.inventoryDelta,
      locationDelta: graphResult.locationDelta,
      playerIntent: graphResult.playerIntent,
      playerMessage,
      sceneContext: buildSceneContext(
        governingScene,
        failure ? 'continue' : graphResult.sceneOutcome
      ),
      skillCheckPlan: graphResult.skillCheckPlan,
      skillCheckResult: graphResult.skillCheckResult,
      systemMessage,
      turnSequence
    };
  }

  async #emitClosureEvent(input: {
    chronicle: Chronicle;
    closingTurnSequence: number;
    llmPlayer: LLMPlayer;
  }): Promise<void> {
    if (this.closureEmitter === undefined) {
      return;
    }
    const event: ChronicleClosureEvent = {
      characterId: input.chronicle.characterId ?? undefined,
      chronicleId: input.chronicle.id,
      locationName: input.chronicle.locationName,
      playerId: input.chronicle.playerId,
      playerIsAdmin: input.llmPlayer.isAdmin,
      playerName: input.llmPlayer.name,
      requestedAt: Date.now(),
      summaryKinds: CLOSURE_SUMMARY_KINDS,
      turnSequence: input.closingTurnSequence,
    };
    await this.closureEmitter.publish(event);
  }
}

export { GmEngine };
