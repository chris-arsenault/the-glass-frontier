"use strict";

import { v4 as uuid  } from "uuid";
import { HubValidationError  } from "../commandErrors.js";

function renderNarrativeInput({ verb, actorId, roomId, args }) {
  const argSummary = Object.entries(args || {})
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(", ");
  return `[hub:${roomId}] ${actorId} uses ${verb.label}${argSummary ? ` (${argSummary})` : ""}`;
}

function pickRoomStateSnapshot(state) {
  if (!state) {
    return null;
  }

  const snapshot = {};

  if (state.participants) {
    snapshot.participants = state.participants.map((participant) => ({
      connectionId: participant.connectionId || null,
      actorId: participant.actorId || null,
      characterId: participant.characterId || null,
      metadata: participant.metadata || {}
    }));
  }

  if (state.pendingTrades) {
    snapshot.pendingTrades = state.pendingTrades.map((trade) => ({
      tradeId: trade.tradeId || null,
      actorId: trade.actorId || null,
      target: trade.target || null,
      item: trade.item || null,
      status: trade.status || null,
      issuedAt: trade.issuedAt || null
    }));
  }

  if (state.rituals) {
    snapshot.rituals = state.rituals.map((ritual) => ({
      ritualId: ritual.ritualId || null,
      actorId: ritual.actorId || null,
      relicId: ritual.relicId || null,
      status: ritual.status || null,
      issuedAt: ritual.issuedAt || null,
      workflowId: ritual.workflowId || null,
      runId: ritual.runId || null,
      error: ritual.error || null
    }));
  }

  if (state.chatLog) {
    snapshot.chatLog = state.chatLog.map((entry) => ({
      actorId: entry.actorId || null,
      message: entry.message || "",
      issuedAt: entry.issuedAt || null
    }));
  }

  snapshot.commandCount = state.commandCount || 0;
  snapshot.lastCommand = state.lastCommand || null;
  snapshot.lastPresenceEvent = state.lastPresenceEvent || null;

  if (state.sceneCue) {
    snapshot.sceneCue = state.sceneCue;
  }

  return snapshot;
}

function buildSafetySnapshot(command, metadata, momentum) {
  const tags = Array.isArray(command.verb?.safetyTags) ? command.verb.safetyTags : [];
  const capabilityRefs = Array.isArray(command.verb?.capabilities)
    ? command.verb.capabilities.map((ref) => ({
        capabilityId: ref.capabilityId,
        label: ref.label,
        severity: ref.severity,
        rationale: ref.rationale || null
      }))
    : [];
  const metadataFlags = Array.isArray(metadata?.safetyFlags) ? metadata.safetyFlags : [];
  const flags = new Set();
  tags.forEach((tag) => flags.add(`tag:${tag}`));
  metadataFlags.forEach((flag) => flags.add(flag));

  if (momentum && typeof momentum.current === "number") {
    flags.add(`momentum:${momentum.current}`);
  }

  return {
    tags,
    flags: Array.from(flags),
    capabilityRefs,
    contestedActors: Array.isArray(metadata?.contestedActors) ? metadata.contestedActors : [],
    contested: Boolean(metadata?.contestedActors?.length)
  };
}

class HubNarrativeBridge {
  constructor({ narrativeEngine, stateStore = null, clock = Date } = {}) {
    this.narrativeEngine = narrativeEngine;
    this.stateStore = stateStore;
    this.clock = clock;
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

    const auditRef = command.metadata?.auditRef || `hub-command:${uuid()}`;
    const stateSnapshot = this.stateStore
      ? await this.stateStore.getRoomState({ hubId: command.hubId, roomId: command.roomId })
      : null;
    const recentCommands = Array.isArray(stateSnapshot?.state?.recentCommands)
      ? stateSnapshot.state.recentCommands.slice(-5).map((entry) => ({
          actorId: entry.actorId || null,
          verbId: entry.verbId || null,
          args: entry.args || {},
          issuedAt: entry.issuedAt || null,
          auditRef: entry.auditRef || null,
          safetyFlags: Array.isArray(entry.safetyFlags) ? [...entry.safetyFlags] : [],
          capabilityRefs: Array.isArray(entry.capabilityRefs)
            ? entry.capabilityRefs.map((ref) => ({ ...ref }))
            : [],
          narrative: entry.narrative || null
        }))
      : [];
    const roomState = pickRoomStateSnapshot(stateSnapshot?.state || null);
    const momentumState =
      typeof this.narrativeEngine.sessionMemory?.getMomentumState === "function"
        ? this.narrativeEngine.sessionMemory.getMomentumState(sessionId)
        : null;
    const safety = buildSafetySnapshot(command, command.metadata, momentumState);

    const metadata = {
      ...command.metadata,
      scope: "hub",
      topic: "intent.hubNarration",
      verbId: command.verb.verbId,
      hubId: command.hubId,
      roomId: command.roomId,
      auditRef,
      capabilityRefs: safety.capabilityRefs,
      safetyFlags: safety.flags,
      originalArgs: command.args,
      narrativeTemplate: command.verb?.narrative?.narrationTemplate || null,
      hubContext: {
        issuedAt: command.metadata?.issuedAt || (this.clock.now ? this.clock.now() : Date.now()),
        recentCommands,
        roomState,
        momentum: momentumState,
        safety
      }
    };

    const content = renderNarrativeInput(command);

    const result = await this.narrativeEngine.handlePlayerMessage({
      sessionId,
      playerId: command.actorId,
      content,
      metadata
    });

    return {
      ...result,
      auditRef,
      hubContext: metadata.hubContext
    };
  }
}

export {
  HubNarrativeBridge,
  renderNarrativeInput
};
