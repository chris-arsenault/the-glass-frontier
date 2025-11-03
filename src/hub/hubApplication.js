"use strict";

const path = require("path");
const { RateLimiter } = require("./rateLimiter");
const { VerbCatalog } = require("./verbCatalog");
const { CommandParser } = require("./commandParser");
const { HubGateway } = require("./hubGateway");
const { InMemoryPresenceStore } = require("./presence/inMemoryPresenceStore");
const { InMemoryActionLogRepository } = require("./actionLog/inMemoryActionLogRepository");
const { HubTelemetry } = require("./telemetry/hubTelemetry");
const { HubNarrativeBridge } = require("./narrative/hubNarrativeBridge");

function defaultAuthenticator(handshake) {
  const {
    hubId,
    roomId,
    actorId,
    characterId,
    sessionId,
    connectionId,
    actorCapabilities = []
  } = handshake || {};

  if (!hubId || !roomId || !actorId) {
    const error = new Error("hub_authentication_failed");
    error.code = "hub_authentication_failed";
    throw error;
  }

  return {
    hubId,
    roomId,
    actorId,
    characterId: characterId || actorId,
    sessionId: sessionId || `hub-${hubId}-${roomId}`,
    connectionId: connectionId || `${actorId}:${Date.now()}`,
    actorCapabilities,
    metadata: handshake.metadata || {}
  };
}

function createHubApplication({
  verbCatalogPath = path.join(__dirname, "config", "defaultVerbCatalog.json"),
  presenceStore = new InMemoryPresenceStore(),
  actionLogRepository = new InMemoryActionLogRepository(),
  telemetryEmitter = null,
  narrativeEngine = null,
  authenticator = defaultAuthenticator,
  clock = Date,
  replayLimit = 50
} = {}) {
  const verbCatalog = VerbCatalog.fromFile(verbCatalogPath);
  const rateLimiter = new RateLimiter({ clock });
  const commandParser = new CommandParser({ verbCatalog, rateLimiter, clock });
  const telemetry = new HubTelemetry({ emitter: telemetryEmitter });
  const narrativeBridge = narrativeEngine
    ? new HubNarrativeBridge({ narrativeEngine })
    : null;

  const gateway = new HubGateway({
    commandParser,
    presenceStore,
    actionLogRepository,
    telemetry,
    narrativeBridge,
    authenticator,
    clock,
    replayLimit
  });

  return {
    verbCatalog,
    rateLimiter,
    commandParser,
    presenceStore,
    actionLogRepository,
    telemetry,
    narrativeBridge,
    gateway
  };
}

module.exports = {
  createHubApplication
};
