import { log } from "@glass-frontier/utils";
import { LocalCheckBus } from "./services/CheckBus.js";
import type { CheckBus } from "./services/CheckBus.js";
import { InMemorySessionStore, type SessionStore } from "./services/SessionStore.js";
import { LangGraphOrchestrator } from "./langGraph/orchestrator.js";
import { ToolHarness } from "./langGraph/toolHarness.js";
import { SessionTelemetry } from "./langGraph/telemetry.js";
import { SceneFrameNode } from "./langGraph/nodes/SceneFrameNode.js";
import { IntentIntakeNode } from "./langGraph/nodes/IntentIntakeNode.js";
import { SafetyGateNode } from "./langGraph/nodes/SafetyGateNode.js";
import { CheckPlannerNode } from "./langGraph/nodes/CheckPlannerNode.js";
import { NarrativeWeaverNode } from "./langGraph/nodes/NarrativeWeaverNode.js";
import { LangGraphLlmClient } from "./langGraph/llmClient.js";
import type { CheckRequestEnvelope, PlayerMessage, PromptPacket, SafetyAssessment, SessionState } from "./types.js";

interface NarrativeEngineResult {
  narrativeEvent: any;
  checkRequest: CheckRequestEnvelope | null;
  safety?: SafetyAssessment;
  sessionState: SessionState;
}

class NarrativeEngine {
  readonly sessionStore: SessionStore;
  readonly checkBus: CheckBus;
  readonly telemetry: SessionTelemetry;
  readonly tools: ToolHarness;
  readonly llm: LangGraphLlmClient;
  readonly graph: LangGraphOrchestrator;

  constructor(options?: {
    sessionStore?: SessionStore;
    telemetry?: SessionTelemetry;
    llmClient?: LangGraphLlmClient;
  }) {
    this.sessionStore = options?.sessionStore ?? new InMemorySessionStore();
    this.telemetry = options?.telemetry ?? new SessionTelemetry();
    this.tools = new ToolHarness({
      sessionStore: this.sessionStore,
      telemetry: this.telemetry
    });
    this.llm = options?.llmClient ?? new LangGraphLlmClient();
    this.graph = new LangGraphOrchestrator({
      telemetry: this.telemetry,
      nodes: [
        new SceneFrameNode(),
        new IntentIntakeNode(),
        new SafetyGateNode(),
        new CheckPlannerNode(),
        new NarrativeWeaverNode()
      ]
    });
  }

  async handlePlayerMessage({ sessionId, playerId, content, metadata = {} }: PlayerMessage): Promise<NarrativeEngineResult> {
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    this.sessionStore.ensureSession(sessionId);

    const trimmedContent = (content ?? "").trim();

    await this.tools.appendPlayerMessage(sessionId, {
      role: "player",
      playerId,
      content: trimmedContent,
      metadata
    });

    const session = this.tools.loadSession(sessionId);
    const turnSequence = session.turnSequence + 1;

    let graphContext;
    try {
      graphContext = await this.graph.run({
        sessionId,
        playerId,
        turnSequence,
        message: { playerId, content: trimmedContent, metadata },
        session,
        tools: this.tools,
        llm: this.llm,
        telemetry: this.telemetry,
        auditTrail: []
      });
    } catch (error) {
      log("error", "Narrative engine failed during graph execution", {
        sessionId,
        message: error instanceof Error ? error.message : "unknown"
      });
      throw error;
    }

    if (graphContext.checkRequest) {
      await this.tools.dispatchCheckRequest(sessionId, graphContext.checkRequest);
    }

    await this.tools.appendGmMessage(sessionId, {
      role: "gm",
      content: graphContext.narrativeEvent.content,
      metadata: { }
    });

    if (graphContext.safety?.escalate && graphContext.safety.auditRef) {
      await this.tools.escalateModeration(sessionId, {
        auditRef: graphContext.safety.auditRef,
        severity: graphContext.safety.severity ?? "high",
        flags: graphContext.safety.flags ?? [],
        reason: graphContext.safety.reason ?? "safety_gate_triggered"
      });
    }

    log("info", "Narrative engine resolved turn", {
      sessionId,
      checkIssued: Boolean(graphContext.checkRequest),
      safetyEscalated: Boolean(graphContext.safety?.escalate)
    });

    return {
      narrativeEvent: graphContext.narrativeEvent,
      checkRequest: graphContext.checkRequest ?? null,
      safety: graphContext.safety,
      auditTrail: graphContext.auditTrail,
      sessionState: this.sessionStore.getSessionState(sessionId)
    };
  }
  //
  // handleCheckResolved(envelope: { sessionId: string; id: string; result: string; auditRef?: string }): void {
  //   if (!envelope?.sessionId) {
  //     throw new Error("Check resolution missing sessionId");
  //   }
  //
  //   this.sessionStore.recordCheckResolution(envelope.sessionId, envelope);
  //   this.telemetry.recordCheckResolution({
  //     sessionId: envelope.sessionId,
  //     auditRef: envelope.auditRef,
  //     checkId: envelope.id,
  //     result: envelope.result
  //   });
  //   log("info", "Narrative engine recorded check resolution", {
  //     sessionId: envelope.sessionId,
  //     result: envelope.result
  //   });
  // }
  //
  // handleCheckVetoed(envelope: { sessionId: string; auditRef?: string; reason?: string; safetyFlags?: string[] }): void {
  //   if (!envelope?.sessionId) {
  //     throw new Error("Check veto missing sessionId");
  //   }
  //
  //   this.sessionStore.recordCheckVeto(envelope.sessionId, envelope as any);
  //   this.telemetry.recordSafetyEvent({
  //     sessionId: envelope.sessionId,
  //     auditRef: envelope.auditRef,
  //     severity: "high",
  //     flags: envelope.safetyFlags ?? [],
  //     reason: envelope.reason ?? "check_vetoed"
  //   });
  //   log("warn", "Narrative engine recorded check veto", {
  //     sessionId: envelope.sessionId,
  //     reason: envelope.reason ?? ""
  //   });
  // }
}

export { NarrativeEngine };
