import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

import { createContext } from './context';
import { appRouter } from './router';

const ALLOW_ORIGINS = new Set([`"https://${process.env.DOMAIN_NAME}`]);

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
  // Let API Gateway CORS answer preflight. If it still reaches Lambda, return 204.
  if (event.requestContext.http.method === 'OPTIONS') {
    const origin = resolveOriginHeader(event);
    return { headers: corsFor(origin), statusCode: 204 };
  }

  const origin = resolveOriginHeader(event);

  // v11 handler. It reads event.rawPath like "/chronicle/foo.bar" and supports batching via ?batch=1
  return awsLambdaRequestHandler({
    batching: { enabled: true },
    // You can pass event/context into your own context factory if needed.
    createContext: ({ event }) =>
      createContext({ authorizationHeader: getAuthorizationHeader(event) }),
    // Optional: tighten status codes for errors
    onError({ error, path, type }) {
      console.error('trpc_lambda_error', { code: error.code, message: error.message, path, type });
    },
    // Add CORS on ALL non-OPTIONS responses.
    responseMeta() {
      return { headers: corsFor(origin) };
    },
    router: appRouter,
    /**
     * Optionally enforce a base path. If your API route is "ANY /chronicle/{proxy+}",
     * you can uncomment this to be explicit:
     */
    // endpoint: "/chronicle",
  })(event, context);
};

function getAuthorizationHeader(event: APIGatewayProxyEventV2): string | undefined {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  return Array.isArray(header) ? header[0] : header;
}
