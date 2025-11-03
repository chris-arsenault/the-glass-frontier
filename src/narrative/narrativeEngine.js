"use strict";

const { LangGraphOrchestrator } = require("./langGraph/orchestrator");
const { createToolHarness } = require("./langGraph/toolHarness");
const { SessionTelemetry } = require("./langGraph/telemetry");
const { sceneFrameNode } = require("./langGraph/nodes/sceneFrameNode");
const { intentIntakeNode } = require("./langGraph/nodes/intentIntakeNode");
const { safetyGateNode } = require("./langGraph/nodes/safetyGateNode");
const { checkPlannerNode } = require("./langGraph/nodes/checkPlannerNode");
const { narrativeWeaverNode } = require("./langGraph/nodes/narrativeWeaverNode");
const { log } = require("../utils/logger");

class NarrativeEngine {
  constructor({ sessionMemory, checkBus, telemetry } = {}) {
    if (!sessionMemory) {
      throw new Error("NarrativeEngine requires sessionMemory");
    }
    if (!checkBus) {
      throw new Error("NarrativeEngine requires checkBus");
    }

    this.sessionMemory = sessionMemory;
    this.checkBus = checkBus;
    this.telemetry = telemetry || new SessionTelemetry();
    this.tools = createToolHarness({
      sessionMemory: this.sessionMemory,
      checkBus: this.checkBus,
      telemetry: this.telemetry
    });

    this.graph = new LangGraphOrchestrator({
      telemetry: this.telemetry,
      nodes: [sceneFrameNode, intentIntakeNode, safetyGateNode, checkPlannerNode, narrativeWeaverNode]
    });

    if (typeof this.checkBus.onCheckResolved === "function") {
      this.checkBus.onCheckResolved((envelope) => this.handleCheckResolved(envelope));
    }

    if (typeof this.checkBus.onCheckVetoed === "function") {
      this.checkBus.onCheckVetoed((envelope) => this.handleCheckVetoed(envelope));
    }
  }

  async handlePlayerMessage({ sessionId, playerId, content, metadata = {} }) {
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const trimmedContent = (content || "").trim();

    await this.tools.appendPlayerMessage(sessionId, {
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
        promptPackets: [],
        auditTrail: []
      });
    } catch (error) {
      log("error", "Narrative engine failed during graph execution", {
        sessionId,
        message: error.message
      });
      throw error;
    }

    if (graphContext.checkRequest) {
      await this.tools.dispatchCheckRequest(sessionId, graphContext.checkRequest);
    }

    await this.tools.appendGmMessage(sessionId, {
      content: graphContext.narrativeEvent.content,
      markers: graphContext.narrativeEvent.markers,
      metadata: {
        promptPackets: graphContext.promptPackets,
        auditTrail: graphContext.auditTrail
      }
    });

    if (metadata?.topic === "intent.hubNarration" && graphContext.checkRequest) {
      await this.tools.escalateModeration(sessionId, {
        auditRef: graphContext.checkRequest.auditRef,
        severity: "medium",
        flags: ["hub-contested-action"],
        reason: "hub_contested_action"
      });
    }

    if (graphContext.safety?.escalate) {
      await this.tools.escalateModeration(sessionId, {
        auditRef: graphContext.safety.auditRef,
        severity: graphContext.safety.severity || "high",
        flags: graphContext.safety.flags || [],
        reason: graphContext.safety.reason || "safety_gate_triggered"
      });
    }

    log("info", "Narrative engine resolved turn", {
      sessionId,
      checkIssued: Boolean(graphContext.checkRequest),
      safetyEscalated: Boolean(graphContext.safety?.escalate)
    });

    return {
      narrativeEvent: graphContext.narrativeEvent,
      checkRequest: graphContext.checkRequest,
      safety: graphContext.safety,
      promptPackets: graphContext.promptPackets,
      auditTrail: graphContext.auditTrail,
      sessionState: this.sessionMemory.getSessionState(sessionId)
    };
  }

  handleCheckResolved(envelope) {
    if (!envelope?.sessionId) {
      throw new Error("Check resolution missing sessionId");
    }

    this.sessionMemory.recordCheckResolution(envelope.sessionId, envelope);
    this.telemetry?.recordCheckResolution({
      sessionId: envelope.sessionId,
      auditRef: envelope.auditRef,
      checkId: envelope.id,
      result: envelope.result
    });
    log("info", "Narrative engine recorded check resolution", {
      sessionId: envelope.sessionId,
      result: envelope.result
    });
  }

  handleCheckVetoed(envelope) {
    if (!envelope?.sessionId) {
      throw new Error("Check veto missing sessionId");
    }

    this.sessionMemory.recordCheckVeto(envelope.sessionId, envelope);
    this.telemetry?.recordSafetyEvent({
      sessionId: envelope.sessionId,
      auditRef: envelope.auditRef,
      severity: "high",
      flags: envelope.safetyFlags || [],
      reason: envelope.reason || "check_vetoed"
    });
    log("warn", "Narrative engine recorded check veto", {
      sessionId: envelope.sessionId,
      reason: envelope.reason
    });
  }
}

module.exports = {
  NarrativeEngine
};
