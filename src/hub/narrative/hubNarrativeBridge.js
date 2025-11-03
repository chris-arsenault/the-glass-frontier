"use strict";

const { HubValidationError } = require("../commandErrors");

function renderNarrativeInput({ verb, actorId, roomId, args }) {
  const argSummary = Object.entries(args || {})
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(", ");
  return `[hub:${roomId}] ${actorId} uses ${verb.label}${argSummary ? ` (${argSummary})` : ""}`;
}

class HubNarrativeBridge {
  constructor({ narrativeEngine }) {
    this.narrativeEngine = narrativeEngine;
  }

  async escalate(command) {
    if (!this.narrativeEngine) {
      throw new HubValidationError("narrative_engine_missing");
    }
    const sessionId = command.metadata?.sessionId;
    if (!sessionId) {
      throw new HubValidationError("hub_session_missing_for_narrative", {
        roomId: command.roomId,
        hubId: command.hubId
      });
    }
    const content = renderNarrativeInput(command);
    return this.narrativeEngine.handlePlayerMessage({
      sessionId,
      playerId: command.actorId,
      content,
      metadata: {
        scope: "hub",
        verbId: command.verb.verbId,
        hubId: command.hubId,
        roomId: command.roomId,
        originalArgs: command.args
      }
    });
  }
}

module.exports = {
  HubNarrativeBridge,
  renderNarrativeInput
};
