import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { IncomingMessage } from 'node:http';

import { createContext } from './context';
import { appRouter } from './router';

const resolvePort = (): number => {
  const raw = process.env.GM_API_PORT ?? process.env.PORT ?? '7700';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 7700;
};

const readAuthorizationHeader = (req: IncomingMessage): string | undefined => {
  const header = req.headers['authorization'];
  if (header === undefined) {
    return undefined;
  }
  return Array.isArray(header) ? header[0] : header;
};

export const startLocalServer = (): void => {
  const port = resolvePort();
  const server = createHTTPServer({
    createContext: ({ req }) => createContext({ authorizationHeader: readAuthorizationHeader(req) }),
    router: appRouter,
  }).listen(port, () => {
    log('info', `gm-api listening on http://localhost:${port}`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    log('info', `gm-api received ${signal}, shutting down`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startLocalServer();
}
