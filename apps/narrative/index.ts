import http from "node:http";
import { log } from "@glass-frontier/utils";
import { NarrativeEngine } from "src/narrativeEngine.js";
import { NarrativeHttpServer } from "src/app.js";
import { SessionEventBroadcaster } from "src/http/SessionEventBroadcaster.js";
import { LocalCheckBus } from "src/services/CheckBus.js";
import { InMemorySessionStore } from "src/services/SessionStore.js";

const sessionStore = new InMemorySessionStore();
const checkBus = new LocalCheckBus();
const narrativeEngine = new NarrativeEngine({ sessionStore, checkBus });
const broadcaster = new SessionEventBroadcaster();
const httpServer = new NarrativeHttpServer({
  engine: narrativeEngine,
  broadcaster,
  sessionStore,
  checkBus
});

const server = http.createServer(httpServer.app);
const port = Number(process.env.PORT ?? process.env.LANGGRAPH_PORT ?? 7000);
server.listen(port, () => {
  log("info", "Narrative engine server listening", { port });
});

function shutdown() {
  log("info", "Shutting down narrative engine server");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
