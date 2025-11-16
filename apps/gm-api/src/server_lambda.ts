import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from 'aws-lambda';

import { createContext } from './context';
import { appRouter } from './router';

const allowedOrigins = new Set(
  (process.env.GM_API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
);

const allowAllOrigins = allowedOrigins.size === 0;

const readOrigin = (event: APIGatewayProxyEventV2): string | undefined => {
  const header = event.headers?.origin ?? event.headers?.Origin;
  if (typeof header !== 'string') {
    return undefined;
  }
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readAuthorizationHeader = (event: APIGatewayProxyEventV2): string | undefined => {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  if (header === undefined) {
    return undefined;
  }
  return Array.isArray(header) ? header[0] : header;
};

const readMethod = (event: APIGatewayProxyEventV2): string | undefined => {
  const httpMethod =
    event.requestContext?.http?.method ??
    event.requestContext?.httpMethod ??
    (event as { httpMethod?: string }).httpMethod;
  return typeof httpMethod === 'string' ? httpMethod.toUpperCase() : undefined;
};

const corsHeaders = (origin?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'content-type, authorization, x-trpc-source',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'origin',
  };
  if (origin === undefined) {
    return headers;
  }
  if (allowAllOrigins || allowedOrigins.has(origin)) {
    return {
      ...headers,
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': origin,
    };
  }
  return headers;
};

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> => {
  const origin = readOrigin(event);
  if (readMethod(event) === 'OPTIONS') {
    return { headers: corsHeaders(origin), statusCode: 204 };
  }

  const delegate = awsLambdaRequestHandler({
    batching: { enabled: true },
    createContext: ({ event }) =>
      createContext({
        authorizationHeader: readAuthorizationHeader(event as APIGatewayProxyEventV2),
      }),
    onError({ error, path, type }) {
      console.error('gm-api.trpc_error', {
        code: error.code,
        message: error.message,
        path,
        type,
      });
    },
    responseMeta() {
      return { headers: corsHeaders(origin) };
    },
    router: appRouter,
  });

  return delegate(event, context);
};
