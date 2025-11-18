'use strict';

import { log } from '@glass-frontier/utils';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { randomUUID } from 'node:crypto';

import { appRouter, createContext } from './app';
import { resolvePlayerIdFromHeaders } from './auth';

const port = resolvePort(process.env.PORT, process.env.LLM_PROXY_PORT);
if (typeof process.env.SERVICE_NAME !== 'string' || process.env.SERVICE_NAME.trim().length === 0) {
  process.env.SERVICE_NAME = 'llm-proxy';
}

const server = createHTTPServer({
  createContext: ({ req }) => {
    return createContext({
      playerId: resolvePlayerIdFromHeaders(req.headers),
      requestId: resolveRequestId(req.headers['x-request-id']),
    });
  },
  router: appRouter,
}).listen(port);
console.log(`tRPC dev server on http://localhost:${port}`);

function shutdown(): void {
  log('info', 'Shutting down LLM Proxy');
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function resolvePort(...candidates: Array<string | undefined>): number {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 8082;
}

function resolveRequestId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
    return randomUUID();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return randomUUID();
}
