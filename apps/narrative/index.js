"use strict";

/**
 * LangGraph worker entrypoint.
 * Currently reuses the unified narrative engine HTTP server until the
 * dedicated LangGraph service is split out. Nomad defaults target port 7000.
 */

if (!process.env.PORT) {
  process.env.PORT = process.env.LANGGRAPH_PORT || "7000";
}

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "langgraph";

import http from "http";
import path from "path";
import { NarrativeEngine  } from "../narrative/narrativeEngine.js";
import { createApp  } from "./app.js";
import { log  } from "../utils/logger.js";

const narrativeEngine = new NarrativeEngine();


const app = createApp({
  narrativeEngine,
});

const server = http.createServer(app);

const port = process.env.PORT || 3000;
server.listen(port, () => {
  log("info", "Narrative engine server listening", { port });
});

function shutdown() {
  log("info", "Shutting down narrative engine server");
  closureWorkflowOrchestrator.stop();
  wss.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

