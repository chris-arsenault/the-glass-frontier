import { log } from '@glass-frontier/utils';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';
import { verifyJwt, AUTH_DISABLED_ERROR } from '../services/JwtAuthorizer';

const repository = new ConnectionRepository();

const unauthorized = (): APIGatewayProxyResultV2 => ({
  body: 'unauthorized',
  statusCode: 401,
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return unauthorized();
    }

    const identity = await verifyJwt(token);
    const connectionId = event.requestContext.connectionId;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;

    if (!connectionId || !domainName || !stage) {
      log('error', 'Missing connection metadata', { connectionId: connectionId ?? 'unknown' });
      return { body: 'missing connection metadata', statusCode: 500 };
    }

    await repository.rememberConnection({
      connectionId,
      domainName,
      stage,
      userId: identity.sub,
    });

    return { body: 'ok', statusCode: 200 };
  } catch (error) {
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
