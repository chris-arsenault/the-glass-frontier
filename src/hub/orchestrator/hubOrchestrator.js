"use strict";

const EventEmitter = require("events");
const { v4: uuidv4 } = require("uuid");
const { InMemoryRoomStateStore } = require("../state/inMemoryRoomStateStore");

function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

class HubOrchestrator extends EventEmitter {
  constructor({
    gateway,
    stateStore = null,
    presenceStore = null,
    telemetry = null,
    temporalClient = null,
    clock = Date,
    workerCount = 4,
    maxRecentCommands = 20,
    maxChatMessages = 20,
    maxPendingTrades = 10,
    maxRitualHistory = 10
  } = {}) {
    super();
    if (!gateway) {
      throw new Error("HubOrchestrator requires a gateway");
    }

    this.gateway = gateway;
    this.stateStore =
      stateStore ||
      new InMemoryRoomStateStore({
        clock
      });
    this.presenceStore = presenceStore || null;
    this.telemetry = telemetry || null;
    this.temporalClient = temporalClient || null;
    this.clock = clock;
    this.workerCount = Math.max(1, workerCount || 4);
    this.maxRecentCommands = maxRecentCommands;
    this.maxChatMessages = maxChatMessages;
    this.maxPendingTrades = maxPendingTrades;
    this.maxRitualHistory = maxRitualHistory;

    this.workers = Array.from({ length: this.workerCount }, () => ({
      queue: [],
      processing: false,
      idleResolvers: []
    }));

    this.running = false;

    this.boundHandlers = {
      command: (entry) => {
        this._enqueue(entry);
      },
      connectionOpened: (connection) => {
        Promise.resolve(this._handleConnectionOpened(connection)).catch((error) => {
          this.emit("processingError", {
            stage: "connectionOpened",
            error,
            context: connection
          });
        });
      },
      connectionClosed: (connection) => {
        Promise.resolve(this._handleConnectionClosed(connection)).catch((error) => {
          this.emit("processingError", {
            stage: "connectionClosed",
            error,
            context: connection
          });
        });
      }
    };
  }

  start() {
    if (this.running) {
      return;
    }
    this.gateway.onCommand(this.boundHandlers.command);
    if (typeof this.gateway.onConnectionOpened === "function") {
      this.gateway.onConnectionOpened(this.boundHandlers.connectionOpened);
    }
    if (typeof this.gateway.onConnectionClosed === "function") {
      this.gateway.onConnectionClosed(this.boundHandlers.connectionClosed);
    }
    this.running = true;
  }

  async stop() {
    if (!this.running) {
      return;
    }
    this.gateway.removeCommandHandler(this.boundHandlers.command);
    if (typeof this.gateway.removeConnectionOpenedHandler === "function") {
      this.gateway.removeConnectionOpenedHandler(this.boundHandlers.connectionOpened);
    }
    if (typeof this.gateway.removeConnectionClosedHandler === "function") {
      this.gateway.removeConnectionClosedHandler(this.boundHandlers.connectionClosed);
    }
    this.running = false;
    await this.whenIdle();
  }

  async whenIdle(roomId = null) {
    if (roomId) {
      const worker = this.workers[this._resolveShard(roomId)];
      if (!worker.processing && worker.queue.length === 0) {
        return;
      }
      await new Promise((resolve) => worker.idleResolvers.push(resolve));
      return;
    }

    await Promise.all(
      this.workers.map((worker) => {
        if (!worker.processing && worker.queue.length === 0) {
          return Promise.resolve();
        }
        return new Promise((resolve) => worker.idleResolvers.push(resolve));
      })
    );
  }

  _enqueue(entry) {
    if (!entry || !entry.roomId) {
      return;
    }
    const shard = this._resolveShard(entry.roomId);
    const worker = this.workers[shard];
    worker.queue.push(entry);
    if (!worker.processing) {
      this._drainWorker(worker, shard);
    }
  }

  _resolveShard(roomId) {
    const value = String(roomId || "");
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0; // convert to 32bit integer
    }
    return Math.abs(hash) % this.workerCount;
  }

  _drainWorker(worker, shard) {
    if (worker.processing) {
      return;
    }
    worker.processing = true;

    const run = async () => {
      while (worker.queue.length > 0) {
        const entry = worker.queue.shift();
        try {
          await this._processCommand(entry);
        } catch (error) {
          this.emit("processingError", {
            stage: "command",
            shard,
            error,
            context: entry
          });
        }
      }
    };

    run()
      .catch((error) => {
        this.emit("processingError", { stage: "worker", shard, error });
      })
      .finally(() => {
        worker.processing = false;
        const resolvers = worker.idleResolvers.splice(0, worker.idleResolvers.length);
        resolvers.forEach((resolver) => resolver());
        if (worker.queue.length > 0) {
          this._drainWorker(worker, shard);
        }
      });
  }

  async _processCommand(entry) {
    if (!entry || !entry.roomId) {
      return;
    }
    const issuedAt =
      entry.command?.metadata?.issuedAt ||
      entry.metadata?.issuedAt ||
      (typeof this.clock.now === "function" ? this.clock.now() : Date.now());

    let workflowContext = null;
    if (this._requiresWorkflow(entry)) {
      workflowContext = await this._startHubWorkflow(entry, issuedAt);
    }

    let participants = null;
    if (this.presenceStore && typeof this.presenceStore.listRoomParticipants === "function") {
      try {
        participants = await this.presenceStore.listRoomParticipants(entry.roomId);
      } catch (error) {
        this.emit("processingError", {
          stage: "participants",
          error,
          context: {
            roomId: entry.roomId,
            hubId: entry.hubId
          }
        });
      }
    }

    const result = await this.stateStore.updateRoomState({
      hubId: entry.hubId,
      roomId: entry.roomId,
      apply: (current) =>
        this._projectState(current || {}, {
          entry,
          issuedAt,
          workflowContext,
          participants
        })
    });

    const trackerState = this._buildTrackerSnapshot(result.state);
    const sessionId = entry.metadata?.sessionId || entry.command?.metadata?.sessionId;
    if (sessionId) {
      await this.stateStore.recordTracker({
        sessionId,
        hubId: entry.hubId,
        roomId: entry.roomId,
        actorId: entry.actorId || null,
        verbId: entry.command?.verbId || null,
        stateVersion: result.version,
        issuedAt,
        state: trackerState
      });
    }

    const workflowPayload =
      workflowContext && workflowContext.workflowId
        ? {
            workflowId: workflowContext.workflowId,
            runId: workflowContext.runId || null
          }
        : workflowContext && workflowContext.error
        ? {
            error: workflowContext.error
          }
        : null;

    this._broadcastState({
      hubId: entry.hubId,
      roomId: entry.roomId,
      state: result.state,
      version: result.version,
      command: {
        actorId: entry.actorId,
        verbId: entry.command?.verbId || null,
        args: clone(entry.command?.args || {}),
        issuedAt
      },
      workflow: workflowPayload
    });

    if (this.telemetry && typeof this.telemetry.recordStateUpdated === "function") {
      this.telemetry.recordStateUpdated({
        hubId: entry.hubId,
        roomId: entry.roomId,
        version: result.version,
        verbId: entry.command?.verbId || null,
        actorId: entry.actorId || null
      });
    }

    this.emit("stateUpdated", {
      entry,
      state: result.state,
      version: result.version,
      workflow: workflowContext
    });
  }

  _requiresWorkflow(entry) {
    return Boolean(
      entry?.narrativeEscalation?.checkTemplate ||
        entry?.command?.metadata?.requiresCheck ||
        entry?.metadata?.requiresCheck
    );
  }

  async _startHubWorkflow(entry, issuedAt) {
    if (!this.temporalClient || typeof this.temporalClient.startHubActionWorkflow !== "function") {
      return null;
    }

    const payload = {
      hubId: entry.hubId,
      roomId: entry.roomId,
      actorId: entry.actorId,
      verbId: entry.command?.verbId || null,
      args: clone(entry.command?.args || {}),
      sessionId: entry.metadata?.sessionId || entry.command?.metadata?.sessionId || null,
      checkTemplate: entry.narrativeEscalation?.checkTemplate || null,
      issuedAt
    };

    try {
      const result = await this.temporalClient.startHubActionWorkflow(payload);
      if (this.telemetry && typeof this.telemetry.recordWorkflowStarted === "function") {
        this.telemetry.recordWorkflowStarted({
          hubId: entry.hubId,
          roomId: entry.roomId,
          actorId: entry.actorId || null,
          verbId: entry.command?.verbId || null,
          workflowId: result?.workflowId || null,
          runId: result?.runId || null
        });
      }
      return {
        workflowId: result?.workflowId || null,
        runId: result?.runId || null
      };
    } catch (error) {
      if (this.telemetry && typeof this.telemetry.recordWorkflowFailed === "function") {
        this.telemetry.recordWorkflowFailed({
          hubId: entry.hubId,
          roomId: entry.roomId,
          actorId: entry.actorId || null,
          verbId: entry.command?.verbId || null,
          error: error?.message || "workflow_failed"
        });
      }
      this.emit("workflowError", { entry, error });
      return {
        error: {
          message: error?.message || "workflow_failed"
        }
      };
    }
  }

  async _handleConnectionOpened(connection) {
    if (!connection) {
      return;
    }

    await this._refreshParticipants({
      hubId: connection.hubId,
      roomId: connection.roomId,
      reason: "join",
      actorId: connection.actorId,
      connectionId: connection.connectionId
    });

    const snapshot = await this.stateStore.getRoomState({
      hubId: connection.hubId,
      roomId: connection.roomId
    });

    this.emit("snapshotEvaluated", {
      connectionId: connection.connectionId,
      hubId: connection.hubId,
      roomId: connection.roomId,
      snapshot
    });

    if (!snapshot || snapshot.version === 0 || !snapshot.state) {
      this.emit("processingError", {
        stage: "snapshotUnavailable",
        context: {
          connectionId: connection.connectionId,
          hubId: connection.hubId,
          roomId: connection.roomId,
          version: snapshot ? snapshot.version : 0
        }
      });
      return;
    }

    const message = {
      type: "hub.stateSnapshot",
      payload: {
        hubId: connection.hubId,
        roomId: connection.roomId,
        version: snapshot.version,
        state: snapshot.state
      }
    };
    const delivered = this.gateway.sendToConnection(connection.connectionId, message);
    if (!delivered) {
      this.emit("processingError", {
        stage: "snapshotDeliveryFailed",
        context: {
          connectionId: connection.connectionId,
          hubId: connection.hubId,
          roomId: connection.roomId,
          version: snapshot.version
        }
      });
    } else {
      this.emit("snapshotDispatched", {
        connectionId: connection.connectionId,
        hubId: connection.hubId,
        roomId: connection.roomId,
        version: snapshot.version
      });
    }

    if (this.telemetry && typeof this.telemetry.recordStateSnapshotSent === "function") {
      this.telemetry.recordStateSnapshotSent({
        hubId: connection.hubId,
        roomId: connection.roomId,
        connectionId: connection.connectionId,
        version: snapshot.version
      });
    }
  }

  async _handleConnectionClosed(connection) {
    if (!connection) {
      return;
    }

    await this._refreshParticipants({
      hubId: connection.hubId,
      roomId: connection.roomId,
      reason: "leave",
      actorId: connection.actorId,
      connectionId: connection.connectionId
    });
  }

  async _refreshParticipants({ hubId, roomId, reason, actorId, connectionId }) {
    if (!this.presenceStore || typeof this.presenceStore.listRoomParticipants !== "function") {
      return;
    }

    let participants = [];
    try {
      participants = await this.presenceStore.listRoomParticipants(roomId);
    } catch (error) {
      this.emit("processingError", {
        stage: "refreshParticipants",
        error,
        context: { hubId, roomId }
      });
      return;
    }

    const result = await this.stateStore.updateRoomState({
      hubId,
      roomId,
      apply: (current) => {
        const next = current || {};
        next.participants = participants.map((participant) =>
          this._serializeParticipant(participant)
        );
        next.lastPresenceEvent = {
          type: reason,
          actorId: actorId || null,
          connectionId: connectionId || null,
          occurredAt: this._now()
        };
        return next;
      }
    });

    this._broadcastState({
      hubId,
      roomId,
      state: result.state,
      version: result.version,
      meta: {
        presenceEvent: {
          type: reason,
          actorId: actorId || null,
          connectionId: connectionId || null
        }
      }
    });

    if (this.telemetry && typeof this.telemetry.recordStateUpdated === "function") {
      this.telemetry.recordStateUpdated({
        hubId,
        roomId,
        version: result.version,
        verbId: null,
        actorId: actorId || null
      });
    }
  }

  _projectState(state, { entry, issuedAt, workflowContext, participants }) {
    const next = state || {};
    next.commandCount = (next.commandCount || 0) + 1;
    next.lastUpdatedAt = issuedAt;
    next.lastCommand = {
      actorId: entry.actorId || null,
      verbId: entry.command?.verbId || null,
      issuedAt
    };

    next.recentCommands = this._boundedPush(
      Array.isArray(next.recentCommands) ? next.recentCommands : [],
      {
        actorId: entry.actorId || null,
        verbId: entry.command?.verbId || null,
        args: clone(entry.command?.args || {}),
        issuedAt
      },
      this.maxRecentCommands
    );

    const verbId = entry.command?.verbId;
    switch (verbId) {
      case "verb.say": {
        const message = entry.command?.args?.message || "";
        next.lastMessage = {
          actorId: entry.actorId || null,
          message,
          issuedAt
        };
        next.chatLog = this._boundedPush(
          Array.isArray(next.chatLog) ? next.chatLog : [],
          {
            actorId: entry.actorId || null,
            message,
            issuedAt
          },
          this.maxChatMessages
        );
        break;
      }
      case "verb.offerTrade": {
        const tradeEntry = {
          tradeId: uuidv4(),
          actorId: entry.actorId || null,
          target: entry.command?.args?.target || null,
          item: entry.command?.args?.item || null,
          status: "proposed",
          issuedAt
        };
        next.pendingTrades = this._boundedPush(
          Array.isArray(next.pendingTrades) ? next.pendingTrades : [],
          tradeEntry,
          this.maxPendingTrades
        );
        break;
      }
      case "verb.invokeRelic": {
        const ritualEntry = {
          ritualId: uuidv4(),
          actorId: entry.actorId || null,
          relicId: entry.command?.args?.relicId || null,
          issuedAt,
          status: "triggered"
        };
        if (workflowContext?.workflowId) {
          ritualEntry.status = "workflow";
          ritualEntry.workflowId = workflowContext.workflowId;
          ritualEntry.runId = workflowContext.runId || null;
        } else if (workflowContext?.error) {
          ritualEntry.status = "error";
          ritualEntry.error = workflowContext.error;
        }
        next.rituals = this._boundedPush(
          Array.isArray(next.rituals) ? next.rituals : [],
          ritualEntry,
          this.maxRitualHistory
        );
        break;
      }
      default:
        break;
    }

    if (participants) {
      next.participants = participants.map((participant) =>
        this._serializeParticipant(participant)
      );
    }

    return next;
  }

  _boundedPush(list, value, limit) {
    const next = Array.isArray(list) ? [...list] : [];
    next.push(value);
    while (limit && next.length > limit) {
      next.shift();
    }
    return next;
  }

  _serializeParticipant(participant) {
    if (!participant) {
      return null;
    }
    return {
      connectionId: participant.connectionId || participant.id || null,
      hubId: participant.hubId || null,
      roomId: participant.roomId || null,
      actorId: participant.actorId || null,
      characterId: participant.characterId || null,
      connectedAt: participant.connectedAt || null,
      metadata: clone(participant.metadata || {})
    };
  }

  _broadcastState({ hubId, roomId, state, version, command = null, workflow = null, meta = {} }) {
    const payload = {
      hubId,
      roomId,
      version,
      state,
      meta
    };
    if (command) {
      payload.command = command;
    }
    if (workflow) {
      payload.workflow = workflow;
    }
    this.gateway.broadcastToRoom(roomId, {
      type: "hub.stateUpdate",
      payload
    });
  }

  _buildTrackerSnapshot(state) {
    if (!state) {
      return null;
    }
    return {
      lastCommand: state.lastCommand || null,
      commandCount: state.commandCount || 0,
      pendingTrades: Array.isArray(state.pendingTrades)
        ? state.pendingTrades.slice(-this.maxPendingTrades)
        : [],
      rituals: Array.isArray(state.rituals) ? state.rituals.slice(-this.maxRitualHistory) : [],
      chatLog: Array.isArray(state.chatLog) ? state.chatLog.slice(-this.maxChatMessages) : []
    };
  }

  _now() {
    return typeof this.clock.now === "function" ? this.clock.now() : Date.now();
  }
}

module.exports = {
  HubOrchestrator
};
