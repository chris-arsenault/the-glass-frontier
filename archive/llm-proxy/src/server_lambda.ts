import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { appRouter, createContext } from './app';
import { resolvePlayerIdFromEvent } from './auth';

export const handler: APIGatewayProxyHandlerV2 = awsLambdaRequestHandler({
  createContext: ({ event }) =>
    createContext({
      playerId: resolvePlayerIdFromEvent(event),
      requestId: event.requestContext?.requestId,
    }),
  router: appRouter,
});
