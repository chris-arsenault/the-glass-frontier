import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage } from 'http';

import { createContext } from './context';
import { appRouter } from './router';

const port = Number(process.env.PORT ?? process.env.NARRATIVE_PORT ?? 7000);
const server = createHTTPServer({
  createContext: ({ req }) => createContext({ authorizationHeader: getAuthorizationHeader(req) }),
  router: appRouter,
}).listen(port);
console.log(`tRPC dev server on http://localhost:${port}`);

function shutdown(): void {
  log('info', 'Shutting down narrative engine server');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function getAuthorizationHeader(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  return Array.isArray(header) ? header[0] : header;
}
