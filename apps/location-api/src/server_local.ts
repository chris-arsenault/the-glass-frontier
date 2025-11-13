import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage } from 'http';

import { createContext } from './context';
import { locationRouter } from './router';

const port = Number(process.env.PORT ?? process.env.LOCATION_API_PORT ?? 7300);
const server = createHTTPServer({
  createContext: ({ req }) => createContext({ authorizationHeader: getAuthorizationHeader(req) }),
  router: locationRouter,
}).listen(port);
console.log(`location-api listening on http://localhost:${port}`);

function shutdown(): void {
  log('info', 'Shutting down location API server');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function getAuthorizationHeader(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  return Array.isArray(header) ? header[0] : header;
}
