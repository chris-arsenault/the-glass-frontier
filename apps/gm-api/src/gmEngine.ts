import type { PromptTemplateManager, ModelConfigStore } from '@glass-frontier/app';
import { PromptTemplateRuntime } from '@glass-frontier/app';
import type {
  Character,
  TranscriptEntry,
  Turn,
  Chronicle,
  ChronicleClosureEvent,
  ChronicleSummaryKind,
  ProseAlternate,
} from '@glass-frontier/dto';
import { CheckRunnerNode } from '@glass-frontier/gm-api/gmGraph/nodes/CheckRunnerNode';
import { CheckPlannerNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/CheckPlannerNode';
import { InventoryDeltaNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/InventoryDeltaNode';
import { TurnJudgeNode } from '@glass-frontier/gm-api/gmGraph/nodes/classifiers/TurnJudgeNode';
import { GmResponseNode } from '@glass-frontier/gm-api/gmGraph/nodes/IntentHandlerNodes';
import { WorldUpdater } from '@glass-frontier/gm-api/updaters/WorldUpdater';
import type {
  AgentLoopClient,
  LLMPlayer,
  RetryLLMClient,
  TextEmbeddingClient,
} from '@glass-frontier/llm-client';
import { formatTurnJobId, isDefined, isNonEmptyString, log } from '@glass-frontier/utils';
import {
  type ChronicleStore,
  type WorldSchemaStore,
} from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import { withDerivedRoster } from './entity/derivedRoster';
import {
  type ChronicleClosurePublisher,
  createClosureEmitterFromEnv
} from './eventEmitters/closureEmitter';
import { type TurnProgressPublisher } from './eventEmitters/progressEmitter';
import { createProgressEmitterFromEnv } from './eventEmitters/progressEmitter';
import { IntentClassifierNode } from './gmGraph/nodes/classifiers/IntentClassifierNode';
import { EntityReferenceResolverNode } from './gmGraph/nodes/EntityReferenceResolverNode';
import { EnvironmentNode } from './gmGraph/nodes/EnvironmentNode';
import { SceneSubjectResolverNode } from './gmGraph/nodes/SceneSubjectResolverNode';
import { GmGraphOrchestrator, type PipelineStage } from './gmGraph/orchestrator';
import { runProseAgentPanel } from './proseAgent/panel';
import { buildSceneContext } from './scenes/sceneLifecycle';
import { ChronicleTelemetry } from './telemetry';
import {
  buildSystemErrorEntry,
  ensureFailureNotice,
  narrativeFields,
} from './turnAssembly';
import type { GraphContext, ChronicleState } from './types';

type GmEngineOptions = {
  chronicleStore: ChronicleStore;
  worldSchemaStore: WorldSchemaStore;
  templateManager: PromptTemplateManager;
  llmClient: RetryLLMClient;
  agentLoop: AgentLoopClient;
  embeddings: TextEmbeddingClient;
  modelConfigStore: ModelConfigStore;
};

type HandlePlayerMessageOptions = {
  llmPlayer: LLMPlayer;
  targetEntityIds?: string[];
};

const CLOSURE_SUMMARY_KINDS: ChronicleSummaryKind[] = ['chronicle_story', 'character_bio'];
/**
 * Nothing selects the GM's world material before the turn. What survives ahead
 * of prose is only what later stages need: what the player named, and what the
 * world decided to do. The environment sits after the check because nothing in
 * the check pipeline reads it — its dice-blindness is an input property (it
 * receives neither the player's move nor the roll), not an ordering one — and
 * this way the writer takes the world's move at its freshest.
 */
const GM_PIPELINE: PipelineStage[] = [
  { nodeId: 'intent-classifier', type: 'sequential' },
  { nodeId: 'scene-subject-resolver', type: 'sequential' },
  { nodeId: 'player-entity-reference-resolver', type: 'sequential' },
  { nodeId: 'check-planner', type: 'sequential' },
  { nodeId: 'check-runner', type: 'sequential' },
  { nodeId: 'environment', type: 'sequential' },
  { nodeId: 'gm-response-node', type: 'sequential' },
  {
    nodeIds: ['inventory-delta', 'turn-judge'],
    type: 'parallel',
  },
];

const logResolvedTurn = (
  graphResult: GraphContext,
  chronicleId: string,
  shouldClose: boolean,
  turnSequence: number
): void => {
  const usageCounts = { central: 0, mentioned: 0, unused: 0 };
  for (const entry of graphResult.entityUsage ?? []) {
    usageCounts[entry.usage] += 1;
  }
  log('info', 'Narrative engine resolved turn', {
    checkIssued: Boolean(graphResult.skillCheckPlan),
    chronicleId,
    entitiesCentral: usageCounts.central,
    entitiesMentioned: usageCounts.mentioned,
    entitiesOffered: graphResult.entityContext?.offered.length ?? 0,
    entitiesUnused: usageCounts.unused,
    intentType: graphResult.playerIntent?.intentType ?? 'unknown',
    sceneOutcome: graphResult.sceneOutcome,
    shouldCloseChronicle: shouldClose,
    turnSequence,
  });
};

class GmEngine {
  readonly chronicleStore: ChronicleStore;
  readonly worldSchemaStore: WorldSchemaStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: GmGraphOrchestrator;
  readonly llm: RetryLLMClient;
  readonly agentLoop: AgentLoopClient;
  readonly embeddings: TextEmbeddingClient;
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
    this.agentLoop = options.agentLoop;
    this.embeddings = options.embeddings;
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
    options: HandlePlayerMessageOptions
  ): Promise<{
    turn: Turn;
    updatedCharacter: Character | null;
    locationName: string;
    chronicleStatus: Chronicle['status'];
    beats: Chronicle['beats'];
    entityFocus: Chronicle['entityFocus'];
    activeScene: Chronicle['activeScene'];
    entityRoster: Chronicle['entityRoster'];
  }> {
    const { llmPlayer, targetEntityIds = [] } = options;
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
      targetEntityIds,
      templateRuntime,
      turnId,
      turnSequence,
      worldSchemaStore: this.worldSchemaStore,
    });
    const { result: graphResult, systemMessage: rawSystemMessage } =
      await this.#executeGraph(graphInput, jobId);
    const systemMessage = ensureFailureNotice(graphResult, rawSystemMessage);
    // The agent panel runs concurrently with the world update; its responses
    // are persisted on the turn so the client can page through them.
    const panelPromise = this.#runPanel(graphResult);
    const worldUpdater = new WorldUpdater();
    const worldUpdatedContext = await worldUpdater.update(graphResult);
    const updatedContext = await this.#refreshRosterAfterTransition(worldUpdatedContext);
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

    const proseAlternates = await panelPromise;
    const turn = this.#buildTurn({
      chronicleId,
      graphResult: finalContext,
      playerMessage,
      systemMessage,
      turnId,
      turnSequence,
    });
    this.#attachPanelResponses(turn, proseAlternates);

    if (shouldClose) {
      await this.#emitClosureEvent({
        chronicle: finalContext.chronicleState.chronicle,
        closingTurnSequence: turn.turnSequence,
        llmPlayer,
      });
    }

    const committedTurn = await this.chronicleStore.commitTurn({
      character: finalContext.chronicleState.character,
      chronicle: finalContext.chronicleState.chronicle,
      turn,
    });

    logResolvedTurn(graphResult, chronicleId, shouldClose, turnSequence);

    const updatedCharacter = finalContext.chronicleState.character ?? null;
    const locationName = finalContext.chronicleState.locationName;
    const chronicleStatus = finalContext.chronicleState.chronicle.status;
    const beats = finalContext.chronicleState.chronicle.beats;
    const entityFocus = finalContext.chronicleState.chronicle.entityFocus;
    const activeScene = finalContext.chronicleState.chronicle.activeScene;
    const entityRoster = finalContext.chronicleState.chronicle.entityRoster;

    return {
      activeScene,
      beats,
      chronicleStatus,
      entityFocus,
      entityRoster,
      locationName,
      turn: committedTurn,
      updatedCharacter,
    };
  }

  #createGraph(): GmGraphOrchestrator {
    const intentClassifier = new IntentClassifierNode();
    const sceneSubjectResolver = new SceneSubjectResolverNode();
    const playerEntityReferenceResolver = new EntityReferenceResolverNode('player');
    const environmentNode = new EnvironmentNode();
    const checkPlanner = new CheckPlannerNode();
    const checkRunner = new CheckRunnerNode();
    const gmResponseNode = new GmResponseNode();
    const inventoryDeltaNode = new InventoryDeltaNode();
    const turnJudgeNode = new TurnJudgeNode();

    const nodes = [
      intentClassifier,
      sceneSubjectResolver,
      checkPlanner,
      playerEntityReferenceResolver,
      environmentNode,
      checkRunner,
      gmResponseNode,
      inventoryDeltaNode,
      turnJudgeNode,
    ];

    return new GmGraphOrchestrator(
      nodes,
      GM_PIPELINE,
      this.telemetry,
      { progressEmitter: this.progressEmitter }
    );
  }

  /**
   * The roster is written after the turn, from what the turn used. It was
   * refreshed by re-running the selector whenever the scene or location
   * changed, which asked a scorer to guess the cast again; the narration has
   * already answered that question by the time we get here.
   */
  async #refreshRosterAfterTransition(context: GraphContext): Promise<GraphContext> {
    return withDerivedRoster(context);
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

  #attachPanelResponses(turn: Turn, proseAlternates: ProseAlternate[]): void {
    if (proseAlternates.length > 0 && !turn.failure) {
      turn.proseAlternates = proseAlternates;
    }
  }

  /** Panel only turns whose canonical prose completed; never throws. */
  async #runPanel(context: GraphContext): Promise<ProseAlternate[]> {
    if (context.failure || context.gmResponse === undefined || context.playerIntent === undefined) {
      return [];
    }
    return runProseAgentPanel(context, this.agentLoop);
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
    targetEntityIds,
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
    targetEntityIds: string[];
    templateRuntime: PromptTemplateRuntime;
    turnSequence: number;
    chronicleStore: ChronicleStore;
    llmPlayer: LLMPlayer;
    worldSchemaStore: WorldSchemaStore;
  }): GraphContext {
    return {
      advancesTimeline: false,
      agentLoop: this.agentLoop,
      chronicleId,
      chronicleState,
      chronicleStore,
      effectiveScene: chronicleState.chronicle.activeScene,
      embeddings: this.embeddings,
      failure: false,
      llm: this.llm,
      llmPlayer,
      modelConfigStore: this.modelConfigStore,
      playerIntent: undefined,
      playerMessage,
      sceneOutcome: 'continue',
      sceneOutcomeReason: null,
      shouldCloseChronicle: false,
      targetEntityIds,
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
        systemMessage: buildSystemErrorEntry(message),
      };
    }
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
      ...narrativeFields(graphResult, failure),
      advancesTimeline: graphResult.advancesTimeline,
      chronicleId,
      entityReferences: graphResult.entityReferences,
      entityRoster: graphResult.turnEntityRoster,
      entityUsage: graphResult.entityUsage,
      executedNodes: graphResult.executedNodes,
      failure,
      gmTrace: graphResult.gmTrace === null ? undefined : graphResult.gmTrace,
      id: turnId,
      playerIntent: graphResult.playerIntent,
      playerMessage,
      proseCostUsd: failure ? undefined : graphResult.proseCostUsd,
      sceneContext: buildSceneContext(
        governingScene,
        failure ? 'continue' : graphResult.sceneOutcome,
        failure ? null : graphResult.sceneOutcomeReason
      ),
      skillCheckPlan: graphResult.skillCheckPlan,
      skillCheckResult: graphResult.skillCheckResult,
      systemMessage,
      turnSequence,
      // Kept even on a failed turn: the world moved before the failure, and
      // the next turn should know it.
      worldContent: graphResult.worldContent,
      worldFronts: graphResult.worldFronts,
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
