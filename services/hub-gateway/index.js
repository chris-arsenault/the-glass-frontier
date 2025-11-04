"use strict";

const express = require("express");
const http = require("http");
const { log } = require("../../src/utils/logger");
const { createHubApplication } = require("../../src/hub/hubApplication");
const { HubOrchestrator } = require("../../src/hub/orchestrator/hubOrchestrator");

const port = Number.parseInt(
  process.env.PORT || process.env.HUB_GATEWAY_PORT || "8080",
  10
);
const healthPath = process.env.HUB_GATEWAY_HEALTH_PATH || "/healthz";
const ssePath = process.env.HUB_GATEWAY_SSE_PATH || "/hub/stream";
const commandPath = process.env.HUB_GATEWAY_COMMAND_PATH || "/hub/command";
const workerCount = Number.parseInt(
  process.env.HUB_GATEWAY_WORKERS || "4",
  10
);

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "hub-gateway";

const app = express();
const server = http.createServer(app);

const hubApp = createHubApplication({
  replayLimit: Number.parseInt(process.env.HUB_GATEWAY_REPLAY_LIMIT || "50", 10)
});
const { gateway, telemetry, presenceStore, roomStateStore } = hubApp;

gateway.setupHttpRoutes(app, { ssePath, commandPath });

const orchestrator = new HubOrchestrator({
  gateway,
  presenceStore,
  telemetry,
  stateStore: roomStateStore,
  workerCount
});

orchestrator.on("processingError", (event) => {
  log("error", "Hub orchestrator processing error", {
    stage: event.stage,
    message: event.error?.message,
    hubId: event.context?.hubId || null,
    roomId: event.context?.roomId || null
  });
});

orchestrator.on("workflowError", (event) => {
  log("warn", "Hub orchestrator workflow error", {
    message: event.error?.message,
    hubId: event.entry?.hubId || null,
    roomId: event.entry?.roomId || null
  });
});

app.get(healthPath, (_req, res) => {
  res.json({
    status: "ok",
    service: "hub-gateway",
    connections: gateway.connections?.size || 0
  });
});

let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  log("info", "Hub gateway shutting down");
  Promise.resolve(orchestrator.stop())
    .catch((error) => {
      log("warn", "Hub orchestrator failed to stop cleanly", {
        message: error.message
      });
    })
    .finally(() => {
      server.close(() => process.exit(0));
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, () => {
  log("info", "Hub gateway listening", {
    port,
    ssePath,
    commandPath,
    workerCount
  });
  orchestrator.start();
});
