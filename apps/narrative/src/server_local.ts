import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router";
import { createContext } from "./context";
import { log } from "@glass-frontier/utils"

const port = Number(process.env.PORT ?? process.env.NARRATIVE_PORT ?? 7000);
const server = createHTTPServer({ router: appRouter, createContext }).listen(port);
console.log(`tRPC dev server on http://localhost:${port}`);

function shutdown() {
  log("info", "Shutting down narrative engine server");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);