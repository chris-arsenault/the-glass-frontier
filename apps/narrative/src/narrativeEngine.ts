import { formatTurnJobId, log } from "@glass-frontier/utils";
import { createWorldStateStore, type WorldStateStore } from "@glass-frontier/persistence";
import { LangGraphOrchestrator } from "./langGraph/orchestrator";
import { ChronicleTelemetry } from "./telemetry";
import { CheckPlannerNode, GmSummaryNode, IntentIntakeNode, NarrativeWeaverNode, UpdateCharacterNode } from "./langGraph/nodes";
import { LangGraphLlmClient } from "./langGraph/llmClient";
import { GraphContext, ChronicleState } from "./types";
import { Character, TranscriptEntry, Turn } from "@glass-frontier/dto";
import { randomUUID } from "node:crypto";
import { TurnProgressEmitter, type TurnProgressPublisher } from "./progressEmitter";

class NarrativeEngine {
  readonly worldStateStore: WorldStateStore;
  readonly telemetry: ChronicleTelemetry;
  readonly graph: LangGraphOrchestrator;
  readonly defaultLlm: LangGraphLlmClient;
  readonly progressEmitter?: TurnProgressPublisher;

  constructor(options?: {
    worldStateStore?: WorldStateStore;
    progressEmitter?: TurnProgressPublisher;
  }) {
    this.worldStateStore = options?.worldStateStore ?? createWorldStateStore();
    this.telemetry =  new ChronicleTelemetry();
    this.defaultLlm = new LangGraphLlmClient();
    this.progressEmitter = options?.progressEmitter ?? createProgressEmitterFromEnv();
    this.graph = new LangGraphOrchestrator(
      [
        new IntentIntakeNode(),
        new CheckPlannerNode(),
        new NarrativeWeaverNode(),
        new GmSummaryNode(),
        new UpdateCharacterNode(this.worldStateStore)
      ],
      this.telemetry,
      { progressEmitter: this.progressEmitter }
    );
  }

  async handlePlayerMessage(
    chronicleId: string,
    playerMessage: TranscriptEntry,
    options?: { authorizationHeader?: string }
  ): Promise<{ turn: Turn; updatedCharacter: Character | null }> {
    if (!chronicleId) {
      throw new Error("chronicleId is required");
    }

    const chronicleState: ChronicleState | null = await this.worldStateStore.getChronicleState(chronicleId);
    if (!chronicleState) {
      throw new Error(`Chronicle ${chronicleId} not found`);
    }
    const turnSequence: number = chronicleState.turnSequence + 1;
    const jobId = formatTurnJobId(chronicleId, turnSequence);
    let errorResponse: TranscriptEntry | undefined;

    let graphResult;
    const graphInput: GraphContext = {
      chronicleId,
      turnSequence,
      chronicle: chronicleState,
      playerMessage,
      llm: this.createLlmClient(options?.authorizationHeader),
      telemetry: this.telemetry,
      failure: false
    };
    try {
      graphResult = await this.graph.run(graphInput, { jobId });
    } catch (error) {
      const errorMessage: string = error instanceof Error ? error.message : "unknown"
      log("error", "Narrative engine failed during graph execution", {
        chronicleId,
        message: errorMessage
      });
      errorResponse = {
        id: randomUUID(),
        content: errorMessage,
        role: "system",
        metadata: {
          timestamp: Date.now(),
          tags: ["system-failure"]
        }
      }
    }

    const systemMessage =  graphResult?.systemMessage || errorResponse;
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
      failure: failure
    }

    await this.worldStateStore.addTurn(turn);

    log("info", "Narrative engine resolved turn", {
      chronicleId,
      checkIssued: Boolean(graphResult?.skillCheckPlan),
    });

    const updatedCharacter = graphResult?.updatedCharacter ?? chronicleState.character ?? null;

    return { turn, updatedCharacter };
  }

  private createLlmClient(authorizationHeader?: string): LangGraphLlmClient {
    if (!authorizationHeader) {
      return this.defaultLlm;
    }

    return new LangGraphLlmClient({
      defaultHeaders: {
        "content-type": "application/json",
        authorization: authorizationHeader
      }
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
    log("warn", "Failed to initialize progress emitter", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    return undefined;
  }
}

export { NarrativeEngine };
