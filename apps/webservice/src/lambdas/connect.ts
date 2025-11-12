import { log } from '@glass-frontier/utils';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';
import { verifyJwt, AUTH_DISABLED_ERROR } from '../services/JwtAuthorizer';

const repository = new ConnectionRepository();

const unauthorized = (): APIGatewayProxyResultV2 => ({
  body: 'unauthorized',
  statusCode: 401,
});

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const token = extractToken(event.queryStringParameters);
    if (token === null) {
      return unauthorized();
    }

    const identity = await verifyJwt(token);
    const metadata = extractConnectionMetadata(event.requestContext);
    if (metadata === null) {
      log('error', 'Missing connection metadata', {
        connectionId: event.requestContext.connectionId ?? 'unknown',
      });
      return { body: 'missing connection metadata', statusCode: 500 };
    }

    await repository.rememberConnection({
      connectionId: metadata.connectionId,
      domainName: metadata.domainName,
      stage: metadata.stage,
      userId: identity.sub,
    });

    return { body: 'ok', statusCode: 200 };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown';
    log('warn', 'WebSocket connect failed', {
      reason,
    });
    if (reason === AUTH_DISABLED_ERROR) {
      return { body: 'websocket auth disabled', statusCode: 503 };
    }
    return unauthorized();
  }
};

const extractToken = (
  params: APIGatewayProxyWebsocketEventV2['queryStringParameters']
): string | null => {
  if (params === null || typeof params !== 'object') {
    return null;
  }
  const record = params as Record<string, unknown>;
  const raw = record.token;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractConnectionMetadata = (
  context: APIGatewayProxyWebsocketEventV2['requestContext']
): { connectionId: string; domainName: string; stage: string } | null => {
  const connectionId =
    typeof context.connectionId === 'string' && context.connectionId.length > 0
      ? context.connectionId
      : null;
  const domainName =
    typeof context.domainName === 'string' && context.domainName.length > 0
      ? context.domainName
      : null;
  const stage =
    typeof context.stage === 'string' && context.stage.length > 0 ? context.stage : null;
  if (connectionId === null || domainName === null || stage === null) {
    return null;
  }
  return { connectionId, domainName, stage };
};
