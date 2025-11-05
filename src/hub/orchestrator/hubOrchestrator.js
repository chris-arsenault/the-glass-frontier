"use strict";

const EventEmitter = require("events");
const { v4: uuidv4 } = require("uuid");
const { InMemoryRoomStateStore } = require("../state/inMemoryRoomStateStore");
const { ContestCoordinator } = require("./contestCoordinator");

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
    maxRitualHistory = 10,
    maxContestHistory = 5,
    contestCoordinator = null
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
    this.maxContestHistory = maxContestHistory;
    this.contestCoordinator =
      contestCoordinator ||
      new ContestCoordinator({
        clock
      });

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

    if (this.contestCoordinator && typeof this.contestCoordinator.expire === "function") {
      const expired = this.contestCoordinator.expire({
        roomId: entry.roomId,
        now: issuedAt
      });
      if (Array.isArray(expired) && expired.length > 0) {
        await this._handleContestExpirations({
          hubId: entry.hubId,
          roomId: entry.roomId,
          expiredContests: expired
        });
      }
    }

    let workflowContext = null;
    if (this._requiresWorkflow(entry)) {
      workflowContext = await this._startHubWorkflow(entry, issuedAt);
    }

    let contestEvent = null;
    if (this.contestCoordinator && entry.metadata?.contest) {
      contestEvent = await this._registerContest(entry, issuedAt);
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
          participants,
          contestEvent
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

    const meta = {};
    if (contestEvent?.state) {
      meta.contestEvent = {
        status: contestEvent.status,
        contestId: contestEvent.state.contestId || null,
        contestKey: contestEvent.state.contestKey || null,
        label: contestEvent.state.label || null,
        participants: contestEvent.state.participants || []
      };
    }

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
      workflow: workflowPayload,
      meta
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
      workflow: workflowContext,
      contestEvent
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

  async _registerContest(entry, issuedAt) {
    try {
      const registration = this.contestCoordinator.register({ entry, issuedAt });
      if (!registration) {
        return null;
      }

      if (registration.status === "arming") {
        if (this.telemetry && typeof this.telemetry.recordContestArmed === "function") {
          this.telemetry.recordContestArmed({
            hubId: entry.hubId,
            roomId: entry.roomId,
            contestKey: registration.contestKey,
            participantCount: registration.state?.participants?.length || 1,
            participantCapacity: registration.state?.participantCapacity || null,
            createdAt: registration.state?.createdAt || issuedAt,
            expiresAt: registration.state?.expiresAt || null,
            label: registration.state?.label || null,
            move: registration.state?.move || null,
            type: registration.state?.type || null
          });
        }
        return registration;
      }

      if (registration.status === "started") {
        if (this.telemetry && typeof this.telemetry.recordContestLaunched === "function") {
          this.telemetry.recordContestLaunched({
            hubId: entry.hubId,
            roomId: entry.roomId,
            contestId: registration.contestId,
            contestKey: registration.contestKey,
            participantCount: registration.state?.participants?.length || 0,
            participantCapacity: registration.state?.participantCapacity || null,
            createdAt: registration.state?.createdAt || null,
            startedAt: registration.state?.startedAt || issuedAt,
            label: registration.state?.label || null,
            move: registration.state?.move || null,
            type: registration.state?.type || null
          });
        }
        const workflow = await this._startContestWorkflow(registration.bundle);
        registration.workflow = workflow;
        return registration;
      }

      return registration;
    } catch (error) {
      this.emit("processingError", {
        stage: "contestRegistration",
        error,
        context: {
          hubId: entry.hubId,
          roomId: entry.roomId,
          contestKey: entry.metadata?.contest?.contestKey || null
        }
      });
      return null;
    }
  }

  async _startContestWorkflow(bundle) {
    if (
      !bundle ||
      !this.temporalClient ||
      typeof this.temporalClient.startHubContestWorkflow !== "function"
    ) {
      return null;
    }

    try {
      const result = await this.temporalClient.startHubContestWorkflow(bundle);
      if (this.telemetry && typeof this.telemetry.recordContestWorkflowStarted === "function") {
        this.telemetry.recordContestWorkflowStarted({
          hubId: bundle.hubId,
          roomId: bundle.roomId,
          contestId: bundle.contestId,
          contestKey: bundle.contestKey || null,
          workflowId: result?.workflowId || null,
          runId: result?.runId || null
        });
      }
      return {
        workflowId: result?.workflowId || null,
        runId: result?.runId || null
      };
    } catch (error) {
      if (this.telemetry && typeof this.telemetry.recordContestWorkflowFailed === "function") {
        this.telemetry.recordContestWorkflowFailed({
          hubId: bundle.hubId,
          roomId: bundle.roomId,
          contestId: bundle.contestId,
          contestKey: bundle.contestKey || null,
          error: error?.message || "workflow_failed"
        });
      }
      this.emit("contestWorkflowError", {
        bundle,
        error
      });
      return {
        error: {
          message: error?.message || "workflow_failed"
        }
      };
    }
  }

  async _handleContestExpirations({ hubId, roomId, expiredContests }) {
    for (const contestState of expiredContests) {
      const stateResult = await this._updateContestState({ hubId, roomId, contestState });
      const contestMeta = this._buildContestMeta(contestState);
      this._broadcastContestResolution({ hubId, roomId, stateResult, contestMeta });
      this._recordContestExpiredTelemetry({ hubId, roomId, contestState });
      this._emitContestExpiredEvents({ hubId, roomId, contestState }, stateResult, contestMeta);
    }
  }

  async resolveContest(contestId, resolution = {}) {
    if (!contestId || !this.contestCoordinator) {
      return null;
    }

    const contestState = this.contestCoordinator.resolve(contestId, resolution);
    if (!contestState) {
      return null;
    }

    const hubId = contestState.hubId || resolution.hubId || null;
    const roomId = contestState.roomId || resolution.roomId || null;
    if (!roomId) {
      throw new Error("resolveContest requires a roomId");
    }

    const stateResult = await this._updateContestState({ hubId, roomId, contestState });
    const contestMeta = this._buildContestMeta(contestState);

    this._broadcastContestResolution({ hubId, roomId, stateResult, contestMeta });
    this._recordContestResolvedTelemetry({ hubId, roomId, contestState });

    return this._emitContestResolutionEvents(
      { hubId, roomId, contestState },
      stateResult,
      contestMeta
    );
  }

  async _updateContestState({ hubId, roomId, contestState }) {
    return this.stateStore.updateRoomState({
      hubId,
      roomId,
      apply: (current) => {
        const base = current || {};
        const next = {
          ...base
        };
        next.contests = this._mergeContestState(
          Array.isArray(base.contests) ? base.contests : [],
          contestState
        );
        return next;
      }
    });
  }

  _buildContestMeta(contestState) {
    return {
      status: contestState.status,
      contestId: contestState.contestId || null,
      contestKey: contestState.contestKey || null,
      label: contestState.label || null,
      reason: contestState.reason || null,
      outcome: clone(contestState.outcome) || null,
      sharedComplications: Array.isArray(contestState.sharedComplications)
        ? contestState.sharedComplications.map((entry) => clone(entry))
        : [],
      resolvedAt: contestState.resolvedAt || null,
      expiredAt: contestState.expiredAt || null,
      rematch: contestState.rematch
        ? this._normalizeContestRematch(clone(contestState.rematch))
        : null,
      participants: Array.isArray(contestState.participants)
        ? contestState.participants.map((entry) => ({
            ...entry,
            result: clone(entry.result)
          }))
        : []
    };
  }

  _broadcastContestResolution({ hubId, roomId, stateResult, contestMeta }) {
    this._broadcastState({
      hubId,
      roomId,
      state: stateResult.state,
      version: stateResult.version,
      meta: {
        contestEvent: contestMeta
      }
    });
  }

  _recordContestResolvedTelemetry({ hubId, roomId, contestState }) {
    if (!this.telemetry || typeof this.telemetry.recordContestResolved !== "function") {
      return;
    }
    try {
      this.telemetry.recordContestResolved({
        hubId,
        roomId,
        contestId: contestState.contestId,
        contestKey: contestState.contestKey || null,
        outcome: contestState.outcome || null,
        resolvedAt: contestState.resolvedAt || null,
        startedAt: contestState.startedAt || null,
        createdAt: contestState.createdAt || null,
        participantCount: Array.isArray(contestState.participants)
          ? contestState.participants.length
          : null,
        participantCapacity: contestState.participantCapacity || null,
        sharedComplicationCount: Array.isArray(contestState.sharedComplications)
          ? contestState.sharedComplications.length
          : 0
      });
    } catch (error) {
      this.emit("processingError", {
        stage: "contestResolvedTelemetry",
        error,
        context: {
          contestId: contestState.contestId,
          roomId,
          hubId
        }
      });
    }
  }

  _recordContestExpiredTelemetry({ hubId, roomId, contestState }) {
    if (!this.telemetry || typeof this.telemetry.recordContestExpired !== "function") {
      return;
    }
    try {
      this.telemetry.recordContestExpired({
        hubId,
        roomId,
        contestKey: contestState.contestKey || null,
        expiredAt: contestState.expiredAt || null,
        createdAt: contestState.createdAt || null,
        participantCount: Array.isArray(contestState.participants)
          ? contestState.participants.length
          : null,
        participantCapacity: contestState.participantCapacity || null,
        windowMs: contestState.windowMs || null,
        label: contestState.label || null,
        move: contestState.move || null,
        type: contestState.type || null
      });
    } catch (error) {
      this.emit("processingError", {
        stage: "contestExpiredTelemetry",
        error,
        context: {
          contestKey: contestState.contestKey || null,
          roomId,
          hubId
        }
      });
    }
  }

  _emitContestResolutionEvents({ hubId, roomId, contestState }, stateResult, contestMeta) {
    const contestEvent = {
      status: contestState.status,
      state: contestState
    };

    this.emit("stateUpdated", {
      entry: null,
      state: stateResult.state,
      version: stateResult.version,
      workflow: null,
      contestEvent
    });

    this.emit("contestResolved", {
      contestId: contestState.contestId,
      hubId,
      roomId,
      state: contestState,
      version: stateResult.version
    });

    return {
      contest: contestState,
      state: stateResult.state,
      version: stateResult.version,
      meta: contestMeta
    };
  }

  _emitContestExpiredEvents({ hubId, roomId, contestState }, stateResult, contestMeta) {
    const contestEvent = {
      status: contestState.status,
      state: contestState
    };

    this.emit("stateUpdated", {
      entry: null,
      state: stateResult.state,
      version: stateResult.version,
      workflow: null,
      contestEvent
    });

    this.emit("contestExpired", {
      contestKey: contestState.contestKey || null,
      hubId,
      roomId,
      state: contestState,
      version: stateResult.version
    });

    return {
      contest: contestState,
      state: stateResult.state,
      version: stateResult.version,
      meta: contestMeta
    };
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

  _projectState(state, { entry, issuedAt, workflowContext, participants, contestEvent }) {
    const next = state || {};
    next.commandCount = (next.commandCount || 0) + 1;
    next.lastUpdatedAt = issuedAt;
    next.lastCommand = {
      actorId: entry.actorId || null,
      verbId: entry.command?.verbId || null,
      issuedAt,
      auditRef: entry.command?.metadata?.auditRef || null
    };

    next.recentCommands = this._boundedPush(
      Array.isArray(next.recentCommands) ? next.recentCommands : [],
      {
        actorId: entry.actorId || null,
        verbId: entry.command?.verbId || null,
        args: clone(entry.command?.args || {}),
        issuedAt,
        auditRef: entry.command?.metadata?.auditRef || null,
        safetyFlags: Array.isArray(entry.command?.metadata?.safetyFlags)
          ? [...entry.command.metadata.safetyFlags]
          : [],
        capabilityRefs: Array.isArray(entry.command?.metadata?.capabilityRefs)
          ? entry.command.metadata.capabilityRefs.map((ref) => ({ ...ref }))
          : [],
        narrative: entry.narrative
          ? {
              auditRef: entry.narrative.auditRef || null,
              safety: entry.narrative.safety || null,
              checkRequestId: entry.narrative.checkRequestId || null
            }
          : null
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

    if (contestEvent?.state) {
      next.contests = this._mergeContestState(
        Array.isArray(next.contests) ? next.contests : [],
        contestEvent.state
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

  _mergeContestState(list, contestState) {
    const next = Array.isArray(list) ? [...list] : [];
    const identifier = contestState.contestId || contestState.contestKey || null;
    const index = identifier
      ? next.findIndex((entry) => {
          if (contestState.contestId && entry.contestId) {
            return entry.contestId === contestState.contestId;
          }
          if (contestState.contestKey && entry.contestKey) {
            return entry.contestKey === contestState.contestKey;
          }
          return false;
        })
      : -1;

    const normalized = {
      ...contestState,
      participants: Array.isArray(contestState.participants)
        ? contestState.participants.map((participant) => ({ ...participant }))
        : []
    };

    if (contestState.rematch && typeof contestState.rematch === "object") {
      normalized.rematch = this._normalizeContestRematch({
        ...contestState.rematch
      });
    } else if ("rematch" in normalized) {
      normalized.rematch = null;
    }

    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...normalized
      };
    } else {
      next.push(normalized);
    }

    while (this.maxContestHistory && next.length > this.maxContestHistory) {
      next.shift();
    }

    return next;
  }

  _normalizeContestRematch(rematch) {
    if (!rematch || typeof rematch !== "object") {
      return null;
    }

    const now = typeof this.clock.now === "function" ? this.clock.now() : Date.now();
    const availableAt =
      typeof rematch.availableAt === "number" && Number.isFinite(rematch.availableAt)
        ? rematch.availableAt
        : null;
    const cooldownMs =
      typeof rematch.cooldownMs === "number" && Number.isFinite(rematch.cooldownMs)
        ? rematch.cooldownMs
        : null;

    let remainingMs =
      typeof rematch.remainingMs === "number" && rematch.remainingMs >= 0
        ? rematch.remainingMs
        : null;

    if (availableAt !== null) {
      remainingMs = Math.max(0, availableAt - now);
    } else if (remainingMs === null && cooldownMs !== null) {
      remainingMs = cooldownMs;
    }

    const status =
      availableAt !== null && availableAt <= now
        ? "ready"
        : rematch.status && typeof rematch.status === "string"
        ? rematch.status
        : "cooldown";

    return {
      ...rematch,
      status,
      remainingMs,
      availableAt,
      cooldownMs
    };
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
