import { normalizeLambdaProxyEventForTrpc } from '@glass-frontier/node-utils';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

import { createContext, initializeForLambda, useIamAuth } from './context';
import { appRouter } from './router';

const ALLOW_ORIGINS = new Set([`https://${process.env.DOMAIN_NAME}`]);

// Cold start initialization promise
let initPromise: Promise<void> | undefined;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const resolveOriginHeader = (event: APIGatewayProxyEventV2): string | undefined => {
  const header = event.headers?.origin ?? event.headers?.Origin;
  if (isNonEmptyString(header)) {
    const trimmed = header.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

type RequestContextWithMethod = APIGatewayProxyEventV2['requestContext'] & {
  httpMethod?: string;
};

function resolveRequestMethod(event: APIGatewayProxyEventV2): string | undefined {
  const context = event.requestContext as RequestContextWithMethod | undefined;
  return (
    context?.http?.method ??
    context?.httpMethod ??
    (event as { httpMethod?: string }).httpMethod
  );
}

function corsFor(origin?: string): Record<string, string> {
  const baseHeaders = {
    'access-control-allow-headers': 'content-type, authorization, x-trpc-source',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'origin',
  };
  if (origin !== undefined && ALLOW_ORIGINS.has(origin)) {
    return {
      ...baseHeaders,
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': origin,
    };
  }
  return baseHeaders;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const normalizedEvent = normalizeLambdaProxyEventForTrpc(event);

  // Initialize database pool at cold start (IAM auth is async)
  if (useIamAuth() && initPromise === undefined) {
    initPromise = initializeForLambda();
  }
  if (initPromise !== undefined) {
    await initPromise;
  }

  // Let API Gateway CORS answer preflight. If it still reaches Lambda, return 204.
  const requestMethod = resolveRequestMethod(normalizedEvent);
  if (requestMethod?.toUpperCase() === 'OPTIONS') {
    const origin = resolveOriginHeader(normalizedEvent);
    return {
      body: '',
      headers: corsFor(origin),
      isBase64Encoded: false,
      statusCode: 204,
    };
  }

  const origin = resolveOriginHeader(normalizedEvent);

  // tRPC handler - reads event.rawPath like "/world-schema/getSchema" and supports batching via ?batch=1
  return awsLambdaRequestHandler({
    batching: { enabled: true },
    createContext: ({ event }) =>
      createContext({ authorizationHeader: getAuthorizationHeader(event) }),
    onError({ error, path, type }) {
      console.error('trpc_lambda_error', { code: error.code, message: error.message, path, type });
    },
    responseMeta() {
      return { headers: corsFor(origin) };
    },
    router: appRouter,
  })(normalizedEvent, context);
};

function getAuthorizationHeader(event: APIGatewayProxyEventV2): string | undefined {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  return Array.isArray(header) ? header[0] : header;
}
