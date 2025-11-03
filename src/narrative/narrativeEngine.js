"use strict";

const { intentParserNode } = require("./nodes/intentParserNode");
const { rulesRouterNode } = require("./nodes/rulesRouterNode");
const { narrativeWeaverNode } = require("./nodes/narrativeWeaverNode");
const { log } = require("../utils/logger");

class NarrativeEngine {
  constructor({ sessionMemory, checkBus }) {
    this.sessionMemory = sessionMemory;
    this.checkBus = checkBus;
    if (this.checkBus && typeof this.checkBus.onCheckResolved === "function") {
      this.checkBus.onCheckResolved((envelope) => this.handleCheckResolved(envelope));
    }
  }

  async handlePlayerMessage({ sessionId, playerId, content, metadata = {} }) {
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const session = this.sessionMemory.getSessionState(sessionId);

    this.sessionMemory.appendTranscript(sessionId, {
      role: "player",
      playerId,
      content,
      metadata
    });

    const context = {
      session,
      message: {
        playerId,
        content,
        metadata
      }
    };

    const withIntent = intentParserNode(context);
    const withRules = rulesRouterNode(withIntent);
    const result = narrativeWeaverNode(withRules);

    if (result.checkRequest) {
      this.sessionMemory.recordCheckRequest(sessionId, result.checkRequest);
      this.checkBus.emitCheckRequest(sessionId, result.checkRequest);
    }

    this.sessionMemory.appendTranscript(sessionId, {
      role: "gm",
      content: result.narrativeEvent.content,
      markers: result.narrativeEvent.markers
    });

    log("info", "Narrative engine resolved turn", {
      sessionId,
      requiresCheck: Boolean(result.checkRequest)
    });

    return {
      narrativeEvent: result.narrativeEvent,
      checkRequest: result.checkRequest,
      sessionState: this.sessionMemory.getSessionState(sessionId)
    };
  }

  handleCheckResolved(envelope) {
    if (!envelope?.sessionId) {
      throw new Error("Check resolution missing sessionId");
    }

    this.sessionMemory.recordCheckResolution(envelope.sessionId, envelope);
    log("info", "Narrative engine recorded check resolution", {
      sessionId: envelope.sessionId,
      result: envelope.result
    });
  }
}

module.exports = {
  NarrativeEngine
};
