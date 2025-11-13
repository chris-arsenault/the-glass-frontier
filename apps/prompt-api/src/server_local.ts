import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage } from 'http';

import { createContext } from './context';
import { promptRouter } from './router';

const port = Number(process.env.PORT ?? process.env.PROMPT_API_PORT ?? 7400);
const server = createHTTPServer({
  createContext: ({ req }) => createContext({ authorizationHeader: getAuthorizationHeader(req) }),
  router: promptRouter,
}).listen(port);
console.log(`prompt-api listening on http://localhost:${port}`);

function shutdown(): void {
  log('info', 'Shutting down prompt API server');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function getAuthorizationHeader(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  return Array.isArray(header) ? header[0] : header;
}
