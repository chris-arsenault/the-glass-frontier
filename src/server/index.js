"use strict";

const http = require("http");
const path = require("path");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");
const { SessionMemoryFacade } = require("../memory/sessionMemory");
const {
  CheckBus,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC,
  CHECK_VETOED_TOPIC,
  ADMIN_ALERT_TOPIC,
  MODERATION_DECISION_TOPIC
} = require("../events/checkBus");
const { NarrativeEngine } = require("../narrative/narrativeEngine");
const { CheckRunner } = require("../checkRunner/checkRunner");
const { Broadcaster } = require("./broadcaster");
const { createApp } = require("./app");
const { log } = require("../utils/logger");
const { CheckMetrics } = require("../telemetry/checkMetrics");
const {
  HubVerbRepository,
  HubVerbCatalogStore,
  HubVerbService,
  VerbCatalog
} = require("../hub");
const { SessionClosureCoordinator } = require("../offline/sessionClosureCoordinator");
const { ClosureWorkflowOrchestrator } = require("../offline/closureWorkflowOrchestrator");

const sessionMemory = new SessionMemoryFacade();
const checkBus = new CheckBus();
const broadcaster = new Broadcaster();
const narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus });
const checkMetrics = new CheckMetrics();
const checkRunner = new CheckRunner({
  checkBus,
  sessionMemory,
  telemetry: checkMetrics
});

checkRunner.start();

let hubVerbService = null;
let hubVerbPool = null;

if (process.env.HUB_VERB_DATABASE_URL) {
  try {
    hubVerbPool = new Pool({ connectionString: process.env.HUB_VERB_DATABASE_URL });
    const hubVerbRepository = new HubVerbRepository({ client: hubVerbPool });
    const fallbackCatalogPath = path.join(
      __dirname,
      "..",
      "hub",
      "config",
      "defaultVerbCatalog.json"
    );
    const fallbackCatalog = VerbCatalog.fromFile(fallbackCatalogPath);
    const hubVerbCatalogStore = new HubVerbCatalogStore({
      repository: hubVerbRepository,
      fallbackCatalog,
      clock: Date
    });
    hubVerbService = new HubVerbService({
      repository: hubVerbRepository,
      catalogStore: hubVerbCatalogStore
    });
  } catch (error) {
    log("error", "Failed to initialise hub verb service", {
      message: error.message
    });
  }
}

const sessionClosureCoordinator = new SessionClosureCoordinator({
  publisher: {
    publish(topic, payload) {
      log("info", topic, payload);
      if (payload && payload.sessionId) {
        broadcaster.publish(payload.sessionId, {
          type: topic,
          payload
        });
      }
    }
  }
});
const closureWorkflowOrchestrator = new ClosureWorkflowOrchestrator({
  coordinator: sessionClosureCoordinator,
  sessionMemory,
  checkBus
});
closureWorkflowOrchestrator.start();

const app = createApp({
  narrativeEngine,
  checkBus,
  broadcaster,
  sessionMemory,
  hubVerbService,
  offlineCoordinator: sessionClosureCoordinator
});
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    ws.close(1008, "sessionId required");
    return;
  }

  broadcaster.register(sessionId, ws);
  ws.send(JSON.stringify({ type: "session.connected", sessionId }));

  publishOverlaySnapshot(sessionId);
});

function publishOverlaySnapshot(sessionId) {
  const snapshot = sessionMemory.getOverlaySnapshot(sessionId);
  broadcaster.publish(sessionId, {
    type: "overlay.characterSync",
    payload: snapshot
  });
}

checkBus.onCheckRequest((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: CHECK_REQUEST_TOPIC,
    payload: envelope
  });

  broadcaster.publish(envelope.sessionId, {
    type: "check.prompt",
    payload: envelope
  });
});

checkBus.onCheckResolved((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: CHECK_RESOLVED_TOPIC,
    payload: envelope
  });

  broadcaster.publish(envelope.sessionId, {
    type: "check.result",
    payload: envelope
  });

  publishOverlaySnapshot(envelope.sessionId);
});

checkBus.onCheckVetoed((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: CHECK_VETOED_TOPIC,
    payload: envelope
  });
});

checkBus.onAdminAlert((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: ADMIN_ALERT_TOPIC,
    payload: envelope
  });
});

checkBus.onModerationDecision((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: MODERATION_DECISION_TOPIC,
    payload: envelope
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  log("info", "Narrative engine server listening", { port });
});

function shutdown() {
  log("info", "Shutting down narrative engine server");
  closureWorkflowOrchestrator.stop();
  if (hubVerbPool) {
    hubVerbPool.end().catch((error) => {
      log("warn", "Failed to close hub verb pool", { error: error.message });
    });
  }
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
