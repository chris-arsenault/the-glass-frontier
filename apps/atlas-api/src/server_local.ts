import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage } from 'http';

import { createContext } from './context';
import { appRouter } from './router';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4016;

const server = createHTTPServer({
  createContext: ({ req }) => createContext({ authorizationHeader: getAuthorizationHeader(req) }),
  router: appRouter,
}).listen(PORT);

console.log(`Atlas API (tRPC) listening on http://localhost:${PORT}`);

function shutdown(): void {
  log('info', 'Shutting down Atlas API server');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function getAuthorizationHeader(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  return Array.isArray(header) ? header[0] : header;
}
