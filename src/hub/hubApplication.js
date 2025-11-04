"use strict";

const path = require("path");
const { RateLimiter } = require("./rateLimiter");
const { VerbCatalog } = require("./verbCatalog");
const { CommandParser } = require("./commandParser");
const { HubGateway } = require("./hubGateway");
const { InMemoryPresenceStore } = require("./presence/inMemoryPresenceStore");
const { InMemoryActionLogRepository } = require("./actionLog/inMemoryActionLogRepository");
const { InMemoryRoomStateStore } = require("./state/inMemoryRoomStateStore");
const { HubTelemetry } = require("./telemetry/hubTelemetry");
const { HubNarrativeBridge } = require("./narrative/hubNarrativeBridge");
const { HubVerbCatalogStore } = require("./verbs/hubVerbCatalogStore");

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
  verbRepository = null,
  verbCatalogStore = null,
  presenceStore = new InMemoryPresenceStore(),
  roomStateStore = new InMemoryRoomStateStore(),
  actionLogRepository = new InMemoryActionLogRepository(),
  telemetryEmitter = null,
  narrativeEngine = null,
  authenticator = defaultAuthenticator,
  clock = Date,
  replayLimit = 50
} = {}) {
  const fallbackCatalog = VerbCatalog.fromFile(verbCatalogPath);
  const rateLimiter = new RateLimiter({ clock });
  let store = verbCatalogStore || null;
  let commandParser;

  if (verbRepository) {
    store =
      store ||
      new HubVerbCatalogStore({
        repository: verbRepository,
        fallbackCatalog,
        clock
      });

    commandParser = new CommandParser({
      rateLimiter,
      clock,
      catalogResolver: (hubId) => {
        if (store) {
          const dynamicCatalog = store.getCatalog(hubId);
          if (dynamicCatalog) {
            return dynamicCatalog;
          }
        }
        return fallbackCatalog;
      }
    });
  } else {
    commandParser = new CommandParser({ verbCatalog: fallbackCatalog, rateLimiter, clock });
  }

  const telemetry = new HubTelemetry({ emitter: telemetryEmitter, clock });
  const narrativeBridge = narrativeEngine
    ? new HubNarrativeBridge({ narrativeEngine, stateStore: roomStateStore, clock })
    : null;

  const gateway = new HubGateway({
    commandParser,
    presenceStore,
    actionLogRepository,
    telemetry,
    narrativeBridge,
    authenticator,
    verbCatalogStore: store,
    clock,
    replayLimit
  });

  return {
    verbCatalog: fallbackCatalog,
    verbCatalogStore: store,
    rateLimiter,
    commandParser,
    presenceStore,
    roomStateStore,
    actionLogRepository,
    telemetry,
    narrativeBridge,
    gateway
  };
}

module.exports = {
  createHubApplication
};
