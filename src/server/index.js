"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");
const { SessionMemoryFacade } = require("../memory/sessionMemory");
const { CheckBus, CHECK_REQUEST_TOPIC, CHECK_RESOLVED_TOPIC } = require("../events/checkBus");
const { NarrativeEngine } = require("../narrative/narrativeEngine");
const { Broadcaster } = require("./broadcaster");
const { createApp } = require("./app");
const { log } = require("../utils/logger");

const sessionMemory = new SessionMemoryFacade();
const checkBus = new CheckBus();
const broadcaster = new Broadcaster();
const narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus });

const app = createApp({ narrativeEngine, checkBus, broadcaster });
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
});

checkBus.onCheckRequest((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: CHECK_REQUEST_TOPIC,
    payload: envelope
  });
});

checkBus.onCheckResolved((envelope) => {
  broadcaster.publish(envelope.sessionId, {
    type: CHECK_RESOLVED_TOPIC,
    payload: envelope
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  log("info", "Narrative engine server listening", { port });
});

function shutdown() {
  log("info", "Shutting down narrative engine server");
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
