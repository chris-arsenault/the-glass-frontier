"use strict";

import EventEmitter from "events";
import { v4 as uuid  } from "uuid";
import { HubAuthenticationError, HubValidationError  } from "./commandErrors.js";
import { SseTransport  } from "./transport/sseTransport.js";

import express from "express";

class HubGateway {
  constructor({
    commandParser,
    presenceStore,
    actionLogRepository,
    telemetry,
    narrativeBridge,
    authenticator,
    verbCatalogStore = null,
    clock = Date,
    replayLimit = 50
  }) {
    if (!commandParser) {
      throw new HubValidationError("hub_gateway_missing_command_parser");
    }
    if (!presenceStore) {
      throw new HubValidationError("hub_gateway_missing_presence_store");
    }

    this.commandParser = commandParser;
    this.presenceStore = presenceStore;
    this.actionLogRepository = actionLogRepository;
    this.telemetry = telemetry;
    this.narrativeBridge = narrativeBridge;
    this.authenticator = authenticator || (async () => ({}));
    this.verbCatalogStore = verbCatalogStore;
    this.clock = clock;
    this.replayLimit = replayLimit;
    this.commandBus = new EventEmitter();
    this.lifecycleBus = new EventEmitter();
    this.connections = new Map();

    if (this.verbCatalogStore) {
      this._onCatalogUpdated = this._onCatalogUpdated.bind(this);
      this.verbCatalogStore.on("catalogUpdated", this._onCatalogUpdated);
    }
  }

  onCommand(handler) {
    this.commandBus.on("command", handler);
  }

  removeCommandHandler(handler) {
    this.commandBus.off("command", handler);
  }

  onConnectionOpened(handler) {
    this.lifecycleBus.on("connectionOpened", handler);
  }

  removeConnectionOpenedHandler(handler) {
    this.lifecycleBus.off("connectionOpened", handler);
  }

  onConnectionClosed(handler) {
    this.lifecycleBus.on("connectionClosed", handler);
  }

  removeConnectionClosedHandler(handler) {
    this.lifecycleBus.off("connectionClosed", handler);
  }

  sendToConnection(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    try {
      connection.transport.send(payload);
      return true;
    } catch (error) {
      if (this.telemetry && typeof this.telemetry.recordStateBroadcastFailed === "function") {
        this.telemetry.recordStateBroadcastFailed({
          hubId: connection.hubId,
          roomId: connection.roomId,
          connectionId,
          error: error.message
        });
      }
      return false;
    }
  }

  broadcastToRoom(roomId, message, { excludeConnectionId = null } = {}) {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    this.connections.forEach((connection) => {
      if (connection.roomId !== roomId || connection.connectionId === excludeConnectionId) {
        return;
      }
      try {
        connection.transport.send(payload);
      } catch (error) {
        if (
          this.telemetry &&
          typeof this.telemetry.recordStateBroadcastFailed === "function"
        ) {
          this.telemetry.recordStateBroadcastFailed({
            hubId: connection.hubId,
            roomId: connection.roomId,
            connectionId: connection.connectionId,
            error: error.message
          });
        }
      }
    });
  }

  async acceptConnection({ transport, handshake }) {
    const context = await this._authenticate(handshake);
    const connectionId = context.connectionId || handshake.connectionId;
    if (!connectionId) {
      throw new HubAuthenticationError("hub_connection_missing_id");
    }

    if (this.verbCatalogStore) {
      await this.verbCatalogStore.ensureCatalog(context.hubId);
    }

    const connection = {
      connectionId,
      hubId: context.hubId,
      roomId: context.roomId,
      actorId: context.actorId,
      characterId: context.characterId,
      sessionId: context.sessionId,
      actorCapabilities: context.actorCapabilities || [],
      transport,
      metadata: context.metadata || {},
      connectedAt: this.clock && typeof this.clock.now === "function" ? this.clock.now() : Date.now()
    };

    this.connections.set(connectionId, connection);
    await this.presenceStore.trackConnection({
      hubId: connection.hubId,
      roomId: connection.roomId,
      connectionId,
      actorId: connection.actorId,
      characterId: connection.characterId,
      metadata: connection.metadata
    });

    if (this.telemetry) {
      this.telemetry.recordConnectionOpened({
        hubId: connection.hubId,
        roomId: connection.roomId,
        actorId: connection.actorId
      });
    }

    transport.onMessage((raw) => this._handleRawMessage(connectionId, raw));
    transport.onClose(() => this._handleConnectionClosed(connectionId));

    await this._sendReplay(connection);

    transport.send(
      JSON.stringify({
        type: "hub.system.connected",
        payload: {
          hubId: connection.hubId,
          roomId: connection.roomId,
          actorId: connection.actorId,
          connectionId
        }
      })
    );

    if (this.verbCatalogStore) {
      const versionStamp = this.verbCatalogStore.getVersionStamp(connection.hubId);
      const verbs = this.verbCatalogStore.listVerbs(connection.hubId);
      transport.send(
        JSON.stringify({
          type: "hub.catalog.sync",
          payload: {
            hubId: connection.hubId,
            versionStamp,
            verbs
          }
        })
      );
    }

    const lifecyclePayload = {
      connectionId,
      hubId: connection.hubId,
      roomId: connection.roomId,
      actorId: connection.actorId,
      characterId: connection.characterId,
      sessionId: connection.sessionId,
      actorCapabilities: connection.actorCapabilities,
      metadata: connection.metadata,
      connectedAt: connection.connectedAt
    };
    this.lifecycleBus.emit("connectionOpened", lifecyclePayload);
  }

  async _authenticate(handshake = {}) {
    const context = await this.authenticator(handshake);
    if (!context?.hubId || !context?.roomId) {
      throw new HubAuthenticationError("hub_context_missing", { context });
    }
    if (!context.actorId) {
      throw new HubAuthenticationError("hub_actor_missing", { context });
    }
    return context;
  }

  async handleCommandForConnection(connectionId, payload) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new HubValidationError("hub_connection_unknown", { connectionId });
    }

    await this._handleCommand(connection, payload);
  }

  async _handleRawMessage(connectionId, raw) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    let payload;
    try {
      payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      connection.transport.send(
        JSON.stringify({
          type: "hub.system.error",
          payload: { code: "invalid_json", message: "Payload must be valid JSON." }
        })
      );
      return;
    }

    switch (payload.type) {
      case "hub.ping":
        connection.transport.send(JSON.stringify({ type: "hub.pong", payload: {} }));
        break;
      case "hub.command":
        await this.handleCommandForConnection(connectionId, payload.payload);
        break;
      default:
        connection.transport.send(
          JSON.stringify({
            type: "hub.system.error",
            payload: { code: "unknown_message_type", message: payload.type }
          })
        );
    }
  }

  async _handleCommand(connection, payload = {}) {
    try {
      const catalogOverride = this.verbCatalogStore
        ? this._getVerbCatalog(connection.hubId)
        : null;
      const parsed = this.commandParser.parse(
        {
          verb: payload.verb,
          actorId: connection.actorId,
          roomId: connection.roomId,
          hubId: connection.hubId,
          args: payload.args,
          metadata: {
            ...payload.metadata,
            actorCapabilities: connection.actorCapabilities,
            sessionId: connection.sessionId,
            issuedAt: this.clock.now ? this.clock.now() : Date.now()
          }
        },
        { verbCatalog: catalogOverride }
      );

      const safetyFlagSet = new Set();
      (Array.isArray(parsed.verb.safetyTags) ? parsed.verb.safetyTags : []).forEach((tag) =>
        safetyFlagSet.add(`tag:${tag}`)
      );
      (Array.isArray(payload.metadata?.safetyFlags) ? payload.metadata.safetyFlags : []).forEach((flag) =>
        safetyFlagSet.add(flag)
      );
      (Array.isArray(parsed.metadata?.safetyFlags) ? parsed.metadata.safetyFlags : []).forEach((flag) =>
        safetyFlagSet.add(flag)
      );

      const capabilityRefs = Array.isArray(parsed.verb.capabilities)
        ? parsed.verb.capabilities.map((ref) => ({ ...ref }))
        : [];

      const contestMetadata = parsed.metadata?.contest
        ? JSON.parse(JSON.stringify(parsed.metadata.contest))
        : null;
      if (contestMetadata) {
        contestMetadata.hubId = contestMetadata.hubId || parsed.hubId;
        contestMetadata.roomId = contestMetadata.roomId || parsed.roomId;
        if (contestMetadata.participants?.length > 0) {
          contestMetadata.participants = contestMetadata.participants.map((participant) => ({
            ...participant
          }));
        }
      }

      const contestedActorsSet = new Set(
        Array.isArray(parsed.metadata?.contestedActors) ? parsed.metadata.contestedActors : []
      );
      contestedActorsSet.add(parsed.actorId);
      if (contestMetadata?.contestActors) {
        contestMetadata.contestActors.forEach((actorId) => contestedActorsSet.add(actorId));
      }

      const commandMetadata = {
        ...parsed.metadata,
        capabilityRefs,
        safetyFlags: Array.from(safetyFlagSet),
        momentumCost: parsed.verb?.momentum || null,
        narrativeTemplate: parsed.verb?.narrative?.narrationTemplate || null,
        contest: contestMetadata,
        contestedActors: Array.from(contestedActorsSet)
      };

      if (!commandMetadata.auditRef) {
        commandMetadata.auditRef = `hub-command:${uuid()}`;
      }

      if (commandMetadata.contest?.participants?.length) {
        commandMetadata.contest.participants = commandMetadata.contest.participants.map(
          (participant) => ({
            ...participant,
            auditRef: participant.auditRef || commandMetadata.auditRef
          })
        );
      }

      parsed.metadata = commandMetadata;

      const entry = {
        hubId: parsed.hubId,
        roomId: parsed.roomId,
        actorId: parsed.actorId,
        command: {
          verbId: parsed.verb.verbId,
          args: parsed.args,
          metadata: commandMetadata
        },
        narrativeEscalation: parsed.requiresNarrative ? parsed.verb.narrative : null,
        metadata: commandMetadata,
        safety: {
          tags: Array.isArray(parsed.verb.safetyTags) ? [...parsed.verb.safetyTags] : [],
          capabilityRefs
        }
      };

      if (this.actionLogRepository) {
        await this.actionLogRepository.append({
          roomId: parsed.roomId,
          entry
        });
      }

      this.commandBus.emit("command", entry);

      if (this.telemetry) {
        this.telemetry.recordCommandAccepted({
          hubId: parsed.hubId,
          roomId: parsed.roomId,
          actorId: parsed.actorId,
          verbId: parsed.verb.verbId
        });
      }

      if (parsed.requiresNarrative && this.narrativeBridge) {
        if (this.telemetry) {
          this.telemetry.recordNarrativeEscalation({
            hubId: parsed.hubId,
            roomId: parsed.roomId,
            actorId: parsed.actorId,
            verbId: parsed.verb.verbId
          });
        }
        const result = await this.narrativeBridge.escalate(parsed);

        commandMetadata.auditRef = result.auditRef;
        commandMetadata.hubContext = result.hubContext || null;
        entry.command.metadata = commandMetadata;
        entry.metadata = commandMetadata;
        entry.narrative = {
          auditRef: result.auditRef,
          safety: result.safety || null,
          checkRequestId: result.checkRequest?.id || null
        };

        if (this.telemetry) {
          this.telemetry.recordNarrativeDelivered({
            hubId: parsed.hubId,
            roomId: parsed.roomId,
            actorId: parsed.actorId,
            verbId: parsed.verb.verbId,
            auditRef: result.auditRef,
            contested: Boolean(result.checkRequest),
            safetyEscalated: Boolean(result.safety?.escalate)
          });

          if (result.checkRequest) {
            this.telemetry.recordContestedAction({
              hubId: parsed.hubId,
              roomId: parsed.roomId,
              actorId: parsed.actorId,
              verbId: parsed.verb.verbId,
              auditRef: result.auditRef,
              checkId: result.checkRequest.id || null
            });
          }

          if (result.safety?.escalate) {
            this.telemetry.recordSafetyEscalated({
              hubId: parsed.hubId,
              roomId: parsed.roomId,
              actorId: parsed.actorId,
              verbId: parsed.verb.verbId,
              auditRef: result.safety.auditRef || result.auditRef,
              severity: result.safety.severity || "high",
              flags: result.safety.flags || []
            });
          }
        }
        connection.transport.send(
          JSON.stringify({
            type: "hub.narrative.update",
            payload: {
              verbId: parsed.verb.verbId,
              narrativeEvent: result?.narrativeEvent || null,
              checkRequest: result?.checkRequest || null,
              safety: result?.safety || null,
              auditTrail: result?.auditTrail || [],
              promptPackets: result?.promptPackets || [],
              auditRef: result.auditRef,
              hubContext: result?.hubContext || null
            }
          })
        );
      }

      connection.transport.send(
        JSON.stringify({
          type: "hub.command.accepted",
          payload: {
            verbId: parsed.verb.verbId,
            issuedAt: parsed.metadata.issuedAt
          }
        })
      );
    } catch (error) {
      const message = error.message || "command_failed";
      if (this.telemetry) {
        this.telemetry.recordCommandRejected({
          hubId: connection.hubId,
          roomId: connection.roomId,
          actorId: connection.actorId,
          verbId: payload.verb,
          reason: error.code || error.name || "unknown_error"
        });
      }
      connection.transport.send(
        JSON.stringify({
          type: "hub.command.rejected",
          payload: {
            verbId: payload.verb,
            code: error.code || error.name || "unknown_error",
            message
          }
        })
      );
    }
  }

  async _handleConnectionClosed(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    await this.presenceStore.removeConnection({
      roomId: connection.roomId,
      connectionId
    });

    if (this.telemetry) {
      this.telemetry.recordConnectionClosed({
        hubId: connection.hubId,
        roomId: connection.roomId,
        actorId: connection.actorId
      });
    }

    this.lifecycleBus.emit("connectionClosed", {
      connectionId,
      hubId: connection.hubId,
      roomId: connection.roomId,
      actorId: connection.actorId,
      characterId: connection.characterId,
      sessionId: connection.sessionId,
      metadata: connection.metadata
    });

    this.connections.delete(connectionId);
  }

  async _sendReplay(connection) {
    if (!this.actionLogRepository) {
      return;
    }
    const replay = await this.actionLogRepository.getReplay({
      roomId: connection.roomId,
      since: connection.metadata?.lastAck || 0,
      limit: this.replayLimit
    });
    if (!replay || replay.length === 0) {
      return;
    }
    connection.transport.send(
      JSON.stringify({
        type: "hub.command.replay",
        payload: replay.map((entry) => ({
          verbId: entry.command.verbId,
          args: entry.command.args,
          issuedAt: entry.metadata?.issuedAt
        }))
      })
    );
  }

  _getVerbCatalog(hubId) {
    if (!this.verbCatalogStore) {
      return null;
    }
    const catalog = this.verbCatalogStore.getCatalog(hubId);
    if (!catalog) {
      throw new HubValidationError("hub_catalog_missing", { hubId });
    }
    return catalog;
  }

  _onCatalogUpdated({ hubId, versionStamp, verbs }) {
    if (!this.connections || this.connections.size === 0) {
      return;
    }

    if (this.telemetry && typeof this.telemetry.recordCatalogUpdated === "function") {
      this.telemetry.recordCatalogUpdated({
        hubId: hubId || "GLOBAL",
        versionStamp,
        verbCount: Array.isArray(verbs) ? verbs.length : 0
      });
    }

    this.connections.forEach((connection) => {
      if (hubId && connection.hubId !== hubId) {
        return;
      }
      this._sendCatalogUpdate(connection, { versionStamp, verbs });
    });
  }

  _sendCatalogUpdate(connection, { versionStamp, verbs }) {
    try {
      connection.transport.send(
        JSON.stringify({
          type: "hub.catalog.updated",
          payload: {
            hubId: connection.hubId,
            versionStamp,
            verbs
          }
        })
      );
    } catch (error) {
      if (this.telemetry && typeof this.telemetry.recordCatalogBroadcastFailed === "function") {
        this.telemetry.recordCatalogBroadcastFailed({
          hubId: connection.hubId,
          connectionId: connection.connectionId,
          error: error.message
        });
      }
    }
  }

  attachHttpInterface({
    app,
    ssePath = "/hub/stream",
    commandPath = "/hub/command"
  }) {
    if (!app || typeof app.get !== "function") {
      throw new HubValidationError("hub_gateway_http_app_invalid");
    }

    const jsonParser = express.json();

    const parseQueryHandshake = (req) => {
      const capabilities = req.query.actorCapabilities
        ? String(req.query.actorCapabilities)
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

      return {
        hubId: req.query.hubId,
        roomId: req.query.roomId,
        actorId: req.query.actorId,
        sessionId: req.query.sessionId,
        connectionId:
          req.query.connectionId ||
          `sse:${req.query.actorId}:${this.clock.now ? this.clock.now() : Date.now()}`,
        actorCapabilities: capabilities,
        metadata: {
          transport: "sse"
        }
      };
    };

    app.get(ssePath, async (req, res) => {
      try {
        const handshake = parseQueryHandshake(req);
        const transport = new SseTransport({ request: req, response: res });
        await this.acceptConnection({ transport, handshake });
      } catch (error) {
        res.status(401).json({
          error: error.code || error.message || "hub_authentication_failed"
        });
      }
    });

    app.post(commandPath, jsonParser, async (req, res) => {
      const { connectionId, command } = req.body || {};
      if (!connectionId || !command) {
        res.status(400).json({ error: "connection_id_and_command_required" });
        return;
      }

      try {
        await this.handleCommandForConnection(connectionId, command);
        res.status(202).json({ status: "accepted" });
      } catch (error) {
        const status = error.code === "hub_connection_unknown" ? 404 : 400;
        res.status(status).json({
          error: error.code || error.message,
          details: error.details || null
        });
      }
    });
  }
}

export {
  HubGateway
};
