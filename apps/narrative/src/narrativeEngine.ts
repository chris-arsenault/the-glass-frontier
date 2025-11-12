import type { Character, TranscriptEntry, Turn, LocationSummary, PendingEquip } from '@glass-frontier/dto';
import type {
  PromptTemplateManager } from '@glass-frontier/persistence';
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

class NarrativeEngine {
  readonly worldStateStore: WorldStateStore;
  readonly locationGraphStore: LocationGraphStore;
  readonly imbuedRegistryStore: ImbuedRegistryStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: LangGraphOrchestrator;
  readonly defaultLlm: LangGraphLlmClient;
  readonly progressEmitter?: TurnProgressPublisher;
  readonly templateManager: PromptTemplateManager;

  constructor(options?: {
    worldStateStore?: WorldStateStore;
    locationGraphStore?: LocationGraphStore;
    imbuedRegistryStore?: ImbuedRegistryStore;
    progressEmitter?: TurnProgressPublisher;
    templateManager: PromptTemplateManager;
  }) {
    this.worldStateStore = options?.worldStateStore ?? createWorldStateStore();
    this.locationGraphStore =
      options?.locationGraphStore ??
      createLocationGraphStore({
        bucket: process.env.NARRATIVE_S3_BUCKET,
        prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
      });
    this.imbuedRegistryStore =
      options?.imbuedRegistryStore ??
      createImbuedRegistryStore({
        bucket: process.env.NARRATIVE_S3_BUCKET,
        prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
      });
    if (!options?.templateManager) {
      throw new Error('NarrativeEngine requires a prompt template manager instance');
    }
    this.templateManager = options.templateManager;
    this.telemetry = new ChronicleTelemetry();
    this.defaultLlm = new LangGraphLlmClient();
    this.progressEmitter = options?.progressEmitter ?? createProgressEmitterFromEnv();
    this.graph = new LangGraphOrchestrator(
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

  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    options?: { authorizationHeader?: string; pendingEquip?: PendingEquip[] }
  ): Promise<{
    turn: Turn;
    updatedCharacter: Character | null;
    locationSummary: LocationSummary | null;
  }> {
    if (!chronicleId) {
      throw new Error('chronicleId is required');
    }

    const chronicleState: ChronicleState | null =
      await this.worldStateStore.getChronicleState(chronicleId);
    if (!chronicleState) {
      throw new Error(`Chronicle ${chronicleId} not found`);
    }
    const turnSequence: number = chronicleState.turnSequence + 1;
    const loginId = chronicleState.chronicle?.loginId;
    if (!loginId) {
      throw new Error('Chronicle state missing login identifier for template resolution');
    }
    const jobId = formatTurnJobId(chronicleId, turnSequence);
    let errorResponse: TranscriptEntry | undefined;
    const templateRuntime = new PromptTemplateRuntime({
      loginId,
      manager: this.templateManager,
    });

    let graphResult;
    const graphInput: GraphContext = {
      chronicle: chronicleState,
      chronicleId,
      failure: false,
      inventoryDelta: null,
      inventoryPreview: null,
      inventoryRegistry: null,
      inventoryStoreDelta: null,
      llm: this.createLlmClient(options?.authorizationHeader),
      pendingEquip: options?.pendingEquip ?? [],
      playerMessage,
      telemetry: this.telemetry,
      templates: templateRuntime,
      turnSequence,
    };
    try {
      graphResult = await this.graph.run(graphInput, { jobId });
    } catch (error) {
      const errorMessage: string = error instanceof Error ? error.message : 'unknown';
      log('error', 'Narrative engine failed during graph execution', {
        chronicleId,
        message: errorMessage,
      });
      errorResponse = {
        content: errorMessage,
        id: randomUUID(),
        metadata: {
          tags: ['system-failure'],
          timestamp: Date.now(),
        },
        role: 'system',
      };
    }

    const systemMessage = graphResult?.systemMessage || errorResponse;
    const failure: boolean = graphResult?.failure || Boolean(systemMessage);

    const turn: Turn = {
      chronicleId,
      failure: failure,
      gmMessage: graphResult?.gmMessage,
      gmSummary: graphResult?.gmSummary,
      id: randomUUID(),
      inventoryDelta: graphResult?.inventoryDelta ?? undefined,
      playerIntent: graphResult?.playerIntent,
      playerMessage: playerMessage,
      skillCheckPlan: graphResult?.skillCheckPlan,
      skillCheckResult: graphResult?.skillCheckResult,
      systemMessage: systemMessage,
      turnSequence: turnSequence,
    };

    await this.worldStateStore.addTurn(turn);

    log('info', 'Narrative engine resolved turn', {
      checkIssued: Boolean(graphResult?.skillCheckPlan),
      chronicleId,
    });

    const updatedCharacter = graphResult?.updatedCharacter ?? chronicleState.character ?? null;

    const locationSummary = graphResult?.locationSummary ?? null;

    return { locationSummary, turn, updatedCharacter };
  }

  private createLlmClient(authorizationHeader?: string): LangGraphLlmClient {
    if (!authorizationHeader) {
      return this.defaultLlm;
    }

    return new LangGraphLlmClient({
      defaultHeaders: {
        authorization: authorizationHeader,
        'content-type': 'application/json',
      },
    });
  }
}

function createProgressEmitterFromEnv(): TurnProgressPublisher | undefined {
  const queueUrl = process.env.TURN_PROGRESS_QUEUE_URL;
  if (!queueUrl) {
    return undefined;
  }
  try {
    return new TurnProgressEmitter(queueUrl);
  } catch (error) {
    log('warn', 'Failed to initialize progress emitter', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return undefined;
  }
}

export { NarrativeEngine };
