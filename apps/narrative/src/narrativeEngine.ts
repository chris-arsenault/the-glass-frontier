import { formatTurnJobId, log } from '@glass-frontier/utils';
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore,
  PromptTemplateManager,
} from '@glass-frontier/persistence';
import { LangGraphOrchestrator } from './langGraph/orchestrator';
import { ChronicleTelemetry } from './telemetry';
import {
  CheckPlannerNode,
  GmSummaryNode,
  IntentIntakeNode,
  LocationDeltaNode,
  NarrativeWeaverNode,
  UpdateCharacterNode,
} from './langGraph/nodes';
import { LangGraphLlmClient } from './langGraph/llmClient';
import { GraphContext, ChronicleState } from './types';
import { Character, TranscriptEntry, Turn, LocationSummary } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
import { TurnProgressEmitter, type TurnProgressPublisher } from './progressEmitter';
import { PromptTemplateRuntime } from './langGraph/prompts/templateRuntime';

class NarrativeEngine {
  readonly worldStateStore: WorldStateStore;
  readonly locationGraphStore: LocationGraphStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: LangGraphOrchestrator;
  readonly defaultLlm: LangGraphLlmClient;
  readonly progressEmitter?: TurnProgressPublisher;
  readonly templateManager: PromptTemplateManager;

  constructor(options?: {
    worldStateStore?: WorldStateStore;
    locationGraphStore?: LocationGraphStore;
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
        new UpdateCharacterNode(this.worldStateStore, this.locationGraphStore),
      ],
      this.telemetry,
      { progressEmitter: this.progressEmitter }
    );
  }

  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    options?: { authorizationHeader?: string }
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
      chronicleId,
      turnSequence,
      chronicle: chronicleState,
      playerMessage,
      llm: this.createLlmClient(options?.authorizationHeader),
      telemetry: this.telemetry,
      templates: templateRuntime,
      failure: false,
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
        id: randomUUID(),
        content: errorMessage,
        role: 'system',
        metadata: {
          timestamp: Date.now(),
          tags: ['system-failure'],
        },
      };
    }

    const systemMessage = graphResult?.systemMessage || errorResponse;
    const failure: boolean = graphResult?.failure || !!systemMessage;

    const turn: Turn = {
      id: randomUUID(),
      chronicleId,
      playerMessage: playerMessage,
      gmMessage: graphResult?.gmMessage,
      systemMessage: systemMessage,
      gmSummary: graphResult?.gmSummary,
      playerIntent: graphResult?.playerIntent,
      skillCheckPlan: graphResult?.skillCheckPlan,
      skillCheckResult: graphResult?.skillCheckResult,
      turnSequence: turnSequence,
      failure: failure,
    };

    await this.worldStateStore.addTurn(turn);

    log('info', 'Narrative engine resolved turn', {
      chronicleId,
      checkIssued: Boolean(graphResult?.skillCheckPlan),
    });

    const updatedCharacter = graphResult?.updatedCharacter ?? chronicleState.character ?? null;

    const locationSummary = graphResult?.locationSummary ?? null;

    return { turn, updatedCharacter, locationSummary };
  }

  private createLlmClient(authorizationHeader?: string): LangGraphLlmClient {
    if (!authorizationHeader) {
      return this.defaultLlm;
    }

    return new LangGraphLlmClient({
      defaultHeaders: {
        'content-type': 'application/json',
        authorization: authorizationHeader,
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
