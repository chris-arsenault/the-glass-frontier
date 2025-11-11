import { log } from "@glass-frontier/utils";
import { InMemorySessionStore, type SessionStore } from "./services/SessionStore";
import { LangGraphOrchestrator } from "./langGraph/orchestrator";
import { SessionTelemetry } from "./telemetry";
import {CheckPlannerNode, GmSummaryNode, IntentIntakeNode, NarrativeWeaverNode } from "./langGraph/nodes";
import { LangGraphLlmClient } from "./langGraph/llmClient";
import {GraphContext, SessionState} from "./types";
import {TranscriptEntry, Turn} from "@glass-frontier/dto";
import {randomUUID} from "node:crypto";

class NarrativeEngine {
  readonly sessionStore: SessionStore;
  readonly telemetry: SessionTelemetry;
  readonly graph: LangGraphOrchestrator;
  readonly defaultLlm: LangGraphLlmClient;

  constructor(options?: {
    sessionStore?: SessionStore;
  }) {
    this.sessionStore = options?.sessionStore ?? new InMemorySessionStore();
    this.telemetry =  new SessionTelemetry();
    this.defaultLlm = new LangGraphLlmClient();
    this.graph = new LangGraphOrchestrator(
      [
        new IntentIntakeNode(),
        new CheckPlannerNode(),
        new NarrativeWeaverNode(),
        new GmSummaryNode()
      ],
      this.telemetry
    );
  }

  async handlePlayerMessage(sessionId: string, playerMessage: TranscriptEntry, options?: { authorizationHeader?: string }): Promise<Turn> {
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const session: SessionState | null = await this.sessionStore.getSessionState(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const turnSequence: number = session.turnSequence + 1;
    let errorResponse: TranscriptEntry | undefined;

    let graphResult;
    const graphInput: GraphContext = {
      sessionId,
      turnSequence,
      session,
      playerMessage,
      llm: this.createLlmClient(options?.authorizationHeader),
      telemetry: this.telemetry,
      failure: false
    };
    try {
      graphResult = await this.graph.run(graphInput);
    } catch (error) {
      const errorMessage: string = error instanceof Error ? error.message : "unknown"
      log("error", "Narrative engine failed during graph execution", {
        sessionId,
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
      sessionId,
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

    await this.sessionStore.addTurn(turn);

    log("info", "Narrative engine resolved turn", {
      sessionId,
      checkIssued: Boolean(graphResult?.skillCheckPlan),
    });

    return turn;
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

export { NarrativeEngine };
