import type {
  Character,
  TranscriptEntry,
  Turn,
  LocationEntity,
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
} from '@glass-frontier/dto';
import type { PromptTemplateManager } from '@glass-frontier/app';
import {
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';
import {formatTurnJobId, isDefined, isNonEmptyString, log} from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import {
  type ChronicleClosurePublisher,
  createClosureEmitterFromEnv
} from './eventEmitters/closureEmitter';
import { IntentClassifierNode } from './gmGraph/nodes/classifiers/IntentClassifierNode';
import { BeatDetectorNode } from './gmGraph/nodes/classifiers/BeatDetectorNode';
import { BeatTrackerNode } from './gmGraph/nodes/classifiers/BeatTrackerNode';
import { GmGraphOrchestrator } from './gmGraph/orchestrator';
import { PromptTemplateRuntime } from './prompts/templateRuntime';
import { type TurnProgressPublisher } from './eventEmitters/progressEmitter';
import { ChronicleTelemetry } from './telemetry';
import type { GraphContext, ChronicleState } from './types';
import {createProgressEmitterFromEnv} from "./eventEmitters/progressEmitter";
import {RetryLLMClient} from "@glass-frontier/llm-client";
import {CheckPlannerNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/CheckPlannerNode";
import {GmSummaryNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/GmSummaryNode";
import {CheckRunnerNode} from "@glass-frontier/gm-api/gmGraph/nodes/CheckRunnerNode";
import {GmResponseNode} from "@glass-frontier/gm-api/gmGraph/nodes/IntentHandlerNodes";
import {LocationDeltaNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LocationDeltaNode";
import {InventoryDeltaNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/InventoryDeltaNode";
import {WorldUpdater} from "@glass-frontier/gm-api/updaters/WorldUpdater";
import {LoreJudgeNode, LoreSelectorNode} from "@glass-frontier/gm-api/gmGraph/nodes/classifiers/LoreNodes";
import type { LocationStore } from './types';

type GmEngineOptions = {
  chronicleStore: ChronicleStore;
  locationGraphStore: LocationStore;
  worldSchemaStore: WorldSchemaStore;
  templateManager: PromptTemplateManager;
  llmClient: RetryLLMClient;
};

const CLOSURE_SUMMARY_KINDS: ChronicleSummaryKind[] = ['chronicle_story', 'character_bio'];

class GmEngine {
  readonly chronicleStore: ChronicleStore;
  readonly locationGraphStore: LocationStore;
  readonly worldSchemaStore: WorldSchemaStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: GmGraphOrchestrator;
  readonly llm: RetryLLMClient;
  readonly progressEmitter: TurnProgressPublisher;
  readonly closureEmitter: ChronicleClosurePublisher;
  readonly templateManager: PromptTemplateManager;

  constructor(options: GmEngineOptions) {
    this.templateManager = options.templateManager;
    this.chronicleStore = options.chronicleStore;
    this.locationGraphStore = options.locationGraphStore;
    this.worldSchemaStore = options.worldSchemaStore;
    this.telemetry = new ChronicleTelemetry();
    this.llm = options.llmClient;
    this.progressEmitter = createProgressEmitterFromEnv();
    this.closureEmitter = createClosureEmitterFromEnv();
    this.graph = this.#createGraph();
  }

  /* eslint-disable-next-line complexity, max-lines-per-function */
  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    _options?: { authorizationHeader?: string },
  ): Promise<{
    turn: Turn;
    updatedCharacter: Character | null;
    locationSummary: LocationEntity | null;
    chronicleStatus: Chronicle['status'];
  }> {
    this.#assertChronicleId(chronicleId);
    const chronicleState = await this.#loadChronicleState(chronicleId);
    this.#ensureChronicleOpen(chronicleState);
    const turnSequence = chronicleState.turnSequence + 1;
    const turnId = randomUUID();
    const playerId = this.#requirePlayerId(chronicleState);
    const jobId = formatTurnJobId(chronicleId, turnSequence);
    const templateRuntime = this.#createTemplateRuntime(playerId);
    const graphInput = this.#buildGraphInput({
      chronicleId,
      turnId,
      chronicleState,
      playerMessage,
      templateRuntime,
      turnSequence,
      locationGraphStore: this.locationGraphStore,
      worldSchemaStore: this.worldSchemaStore,
    });
    const { result: graphResult, systemMessage } = await this.#executeGraph(graphInput, jobId);
    let chronicleStatus: Chronicle['status'] = chronicleState.chronicle?.status ?? 'open';

    const worldUpdater = new WorldUpdater({chronicleStore: this.chronicleStore, locationGraphStore: this.locationGraphStore});
    const updatedContext = await worldUpdater.update(graphResult);

    const turn = this.#buildTurn({
      chronicleId,
      turnId,
      graphResult: updatedContext,
      playerMessage,
      systemMessage,
      turnSequence,
    });

    await this.chronicleStore.addTurn(turn);


    if (graphResult.shouldCloseChronicle && chronicleState.chronicle?.status !== 'closed') {
      await this.#closeChronicle({
        chronicleState,
        closingTurnSequence: turn.turnSequence,
      });
      chronicleStatus = 'closed';
    }


    log('info', 'Narrative engine resolved turn', {
      checkIssued: Boolean(graphResult.skillCheckPlan),
      chronicleId,
    });

    const updatedCharacter = updatedContext.chronicleState.character ?? null;
    const locationSummary = updatedContext.chronicleState.location ?? null;

    return { chronicleStatus, locationSummary, turn, updatedCharacter };
  }

  #createGraph(): GmGraphOrchestrator {
    const intentClassifier = new IntentClassifierNode();
    const loreSelector = new LoreSelectorNode();
    const beatDetector = new BeatDetectorNode();
    const beatTracker = new BeatTrackerNode();
    const checkPlanner = new CheckPlannerNode();
    const gmSummaryNode = new GmSummaryNode();
    const checkRunner = new CheckRunnerNode();
    const gmResponseNode = new GmResponseNode();
    const loreJudgeNode = new LoreJudgeNode();
    const locationDeltaNode = new LocationDeltaNode();
    const inventoryDeltaNode = new InventoryDeltaNode();

    return new GmGraphOrchestrator(
      [intentClassifier, loreSelector, beatDetector, checkPlanner, checkRunner,
        gmResponseNode, loreJudgeNode, beatTracker, gmSummaryNode,
        locationDeltaNode, inventoryDeltaNode],
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
    return state;
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
      playerId,
      manager: this.templateManager,
    });
  }

  #ensureChronicleOpen(state: ChronicleState): void {
    if (state.chronicle?.status === 'closed') {
      throw new Error('Chronicle is closed.');
    }
  }

  #buildGraphInput({
    chronicleId,
    turnId,
    chronicleState,
    playerMessage,
    templateRuntime,
    turnSequence,
    locationGraphStore,
    worldSchemaStore,
  }: {
    authorizationHeader?: string;
    chronicleId: string;
    turnId: string;
    chronicleState: ChronicleState;
    playerMessage: TranscriptEntry;
    templateRuntime: PromptTemplateRuntime;
    turnSequence: number;
    locationGraphStore: LocationStore;
    worldSchemaStore: WorldSchemaStore;
  }): GraphContext {
    return {
      chronicleId,
      turnId,
      turnSequence,
      chronicleState,
      playerMessage,
      locationGraphStore,
      worldSchemaStore,
      llm: this.llm,
      telemetry: this.telemetry,
      templates: templateRuntime,
      failure: false,
      systemMessage: undefined,
      playerIntent: undefined,
      shouldUpdate: false,
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
    turnId,
    graphResult,
    playerMessage,
    systemMessage,
    turnSequence,
  }: {
    chronicleId: string;
    turnId: string;
    graphResult: GraphContext;
    playerMessage: TranscriptEntry;
    systemMessage?: TranscriptEntry;
    turnSequence: number;
  }): Turn {
    const combinedSystemMessage = systemMessage ?? graphResult.systemMessage;
    const failure = Boolean(graphResult.failure || combinedSystemMessage);
    return {
      advancesTimeline: graphResult.advancesTimeline,
      beatTracker: graphResult.beatTracker ?? undefined,
      chronicleId,
      executedNodes: graphResult.executedNodes ?? undefined,
      failure,
      gmResponse: graphResult.gmResponse,
      gmSummary: graphResult.gmSummary,
      gmTrace: graphResult.gmTrace ?? undefined,
      id: turnId,
      inventoryDelta: graphResult.inventoryDelta ?? undefined,
      loreOffered: graphResult.loreContext?.offered ?? undefined,
      loreUsage: graphResult.loreUsage ?? undefined,
      playerIntent: graphResult.playerIntent,
      playerMessage,
      skillCheckPlan: graphResult.skillCheckPlan,
      skillCheckResult: graphResult.skillCheckResult,
      systemMessage: combinedSystemMessage,
      turnSequence
    };
  }

  async #closeChronicle(input: {
    chronicleState: ChronicleState;
    closingTurnSequence: number;
  }): Promise<void> {
    const record = input.chronicleState.chronicle;
    if (record === undefined || record === null || record.status === 'closed') {
      return;
    }
    await this.chronicleStore.upsertChronicle({
      ...record,
      status: 'closed',
    });
    await this.#emitClosureEvent({
      chronicle: record,
      closingTurnSequence: input.closingTurnSequence,
    });
  }

  async #emitClosureEvent(input: {
    chronicle: Chronicle;
    closingTurnSequence: number;
  }): Promise<void> {
    if (this.closureEmitter === undefined) {
      return;
    }
    const event: ChronicleClosureEvent = {
      characterId: input.chronicle.characterId ?? undefined,
      chronicleId: input.chronicle.id,
      locationId: input.chronicle.locationId,
      playerId: input.chronicle.playerId,
      requestedAt: Date.now(),
      summaryKinds: CLOSURE_SUMMARY_KINDS,
      turnSequence: input.closingTurnSequence,
    };
    await this.closureEmitter.publish(event);
  }
}

export { GmEngine };
