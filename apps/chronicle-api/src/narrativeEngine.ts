import type { Character, TranscriptEntry, Turn, LocationSummary, PendingEquip } from '@glass-frontier/dto';
import type { PromptTemplateManager } from '@glass-frontier/persistence';
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore,
  createImbuedRegistryStore,
  type ImbuedRegistryStore,
} from '@glass-frontier/persistence';
import { formatTurnJobId, log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import { LangGraphLlmClient } from './langGraph/llmClient';
import {
  CheckPlannerNode,
  GmSummaryNode,
  IntentIntakeNode,
  LocationDeltaNode,
  NarrativeWeaverNode,
  UpdateCharacterNode,
  InventoryDeltaNode,
} from './langGraph/nodes';
import { LangGraphOrchestrator } from './langGraph/orchestrator';
import { PromptTemplateRuntime } from './langGraph/prompts/templateRuntime';
import { TurnProgressEmitter, type TurnProgressPublisher } from './progressEmitter';
import { ChronicleTelemetry } from './telemetry';
import type { GraphContext, ChronicleState } from './types';

type NarrativeEngineOptions = {
  worldStateStore?: WorldStateStore;
  locationGraphStore?: LocationGraphStore;
  imbuedRegistryStore?: ImbuedRegistryStore;
  progressEmitter?: TurnProgressPublisher;
  templateManager: PromptTemplateManager;
};

class NarrativeEngine {
  readonly worldStateStore: WorldStateStore;
  readonly locationGraphStore: LocationGraphStore;
  readonly imbuedRegistryStore: ImbuedRegistryStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: LangGraphOrchestrator;
  readonly defaultLlm: LangGraphLlmClient;
  readonly progressEmitter?: TurnProgressPublisher;
  readonly templateManager: PromptTemplateManager;

  constructor(options?: NarrativeEngineOptions) {
    this.templateManager = this.#requireTemplateManager(options);
    this.worldStateStore = this.#resolveWorldStateStore(options?.worldStateStore);
    this.locationGraphStore = this.#resolveLocationGraphStore(options?.locationGraphStore);
    this.imbuedRegistryStore = this.#resolveImbuedRegistryStore(options?.imbuedRegistryStore);
    this.telemetry = new ChronicleTelemetry();
    this.defaultLlm = new LangGraphLlmClient();
    this.progressEmitter = options?.progressEmitter ?? createProgressEmitterFromEnv();
    this.graph = this.#createGraph();
  }

  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    options?: { authorizationHeader?: string; pendingEquip?: PendingEquip[] }
  ): Promise<{
    turn: Turn;
    updatedCharacter: Character | null;
    locationSummary: LocationSummary | null;
  }> {
    this.#assertChronicleId(chronicleId);
    const chronicleState = await this.#loadChronicleState(chronicleId);
    const turnSequence = chronicleState.turnSequence + 1;
    const loginId = this.#requireLoginId(chronicleState);
    const jobId = formatTurnJobId(chronicleId, turnSequence);
    const templateRuntime = this.#createTemplateRuntime(loginId);
    const graphInput = this.#buildGraphInput({
      authorizationHeader: options?.authorizationHeader,
      chronicleId,
      chronicleState,
      pendingEquip: options?.pendingEquip,
      playerMessage,
      templateRuntime,
      turnSequence,
    });
    const { result: graphResult, systemMessage } = await this.#executeGraph(graphInput, jobId);

    const turn = this.#buildTurn({
      chronicleId,
      graphResult,
      playerMessage,
      systemMessage,
      turnSequence,
    });

    await this.worldStateStore.addTurn(turn);

    log('info', 'Narrative engine resolved turn', {
      checkIssued: Boolean(graphResult.skillCheckPlan),
      chronicleId,
    });

    const updatedCharacter = graphResult.updatedCharacter ?? chronicleState.character ?? null;
    const locationSummary = graphResult.locationSummary ?? null;

    return { locationSummary, turn, updatedCharacter };
  }

  private createLlmClient(authorizationHeader?: string): LangGraphLlmClient {
    if (!isNonEmptyString(authorizationHeader)) {
      return this.defaultLlm;
    }
    const headerValue = authorizationHeader.trim();

    return new LangGraphLlmClient({
      defaultHeaders: {
        authorization: headerValue,
        'content-type': 'application/json',
      },
    });
  }

  #requireTemplateManager(options?: NarrativeEngineOptions): PromptTemplateManager {
    const manager = options?.templateManager;
    if (manager === undefined || manager === null) {
      throw new Error('NarrativeEngine requires a prompt template manager instance');
    }
    return manager;
  }

  #resolveWorldStateStore(store?: WorldStateStore): WorldStateStore {
    return store ?? createWorldStateStore();
  }

  #resolveLocationGraphStore(store?: LocationGraphStore): LocationGraphStore {
    if (isDefined(store)) {
      return store;
    }
    return createLocationGraphStore({
      bucket: process.env.NARRATIVE_S3_BUCKET,
      prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
    });
  }

  #resolveImbuedRegistryStore(store?: ImbuedRegistryStore): ImbuedRegistryStore {
    if (isDefined(store)) {
      return store;
    }
    return createImbuedRegistryStore({
      bucket: process.env.NARRATIVE_S3_BUCKET,
      prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
    });
  }

  #createGraph(): LangGraphOrchestrator {
    return new LangGraphOrchestrator(
      [
        new IntentIntakeNode(),
        new CheckPlannerNode(),
        new NarrativeWeaverNode(),
        new LocationDeltaNode(this.locationGraphStore),
        new GmSummaryNode(),
        new InventoryDeltaNode(this.imbuedRegistryStore),
        new UpdateCharacterNode(this.worldStateStore, this.locationGraphStore),
      ],
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
    const state = await this.worldStateStore.getChronicleState(chronicleId);
    if (!isDefined(state)) {
      throw new Error(`Chronicle ${chronicleId} not found`);
    }
    return state;
  }

  #requireLoginId(state: ChronicleState): string {
    const loginId = state.chronicle?.loginId;
    if (!isNonEmptyString(loginId)) {
      throw new Error('Chronicle state missing login identifier for template resolution');
    }
    return loginId.trim();
  }

  #createTemplateRuntime(loginId: string): PromptTemplateRuntime {
    return new PromptTemplateRuntime({
      loginId,
      manager: this.templateManager,
    });
  }

  #buildGraphInput({
    authorizationHeader,
    chronicleId,
    chronicleState,
    pendingEquip,
    playerMessage,
    templateRuntime,
    turnSequence,
  }: {
    authorizationHeader?: string;
    chronicleId: string;
    chronicleState: ChronicleState;
    pendingEquip?: PendingEquip[];
    playerMessage: TranscriptEntry;
    templateRuntime: PromptTemplateRuntime;
    turnSequence: number;
  }): GraphContext {
    return {
      chronicle: chronicleState,
      chronicleId,
      failure: false,
      inventoryDelta: null,
      inventoryPreview: null,
      inventoryRegistry: null,
      inventoryStoreDelta: null,
      llm: this.createLlmClient(authorizationHeader),
      pendingEquip: pendingEquip ?? [],
      playerMessage,
      telemetry: this.telemetry,
      templates: templateRuntime,
      turnSequence,
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
    turnSequence,
  }: {
    chronicleId: string;
    graphResult: GraphContext;
    playerMessage: TranscriptEntry;
    systemMessage?: TranscriptEntry;
    turnSequence: number;
  }): Turn {
    const combinedSystemMessage = systemMessage ?? graphResult.systemMessage;
    const failure = Boolean(graphResult.failure || combinedSystemMessage);
    return {
      chronicleId,
      failure,
      gmMessage: graphResult.gmMessage,
      gmSummary: graphResult.gmSummary,
      id: randomUUID(),
      inventoryDelta: graphResult.inventoryDelta ?? undefined,
      playerIntent: graphResult.playerIntent,
      playerMessage,
      skillCheckPlan: graphResult.skillCheckPlan,
      skillCheckResult: graphResult.skillCheckResult,
      systemMessage: combinedSystemMessage,
      turnSequence,
    };
  }
}

function createProgressEmitterFromEnv(): TurnProgressPublisher | undefined {
  const queueUrl = process.env.TURN_PROGRESS_QUEUE_URL;
  if (!isNonEmptyString(queueUrl)) {
    return undefined;
  }
  const trimmed = queueUrl.trim();
  try {
    return new TurnProgressEmitter(trimmed);
  } catch (error) {
    log('warn', 'Failed to initialize progress emitter', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return undefined;
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isDefined = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export { NarrativeEngine };
