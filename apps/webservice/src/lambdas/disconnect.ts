import { log } from '@glass-frontier/utils';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';

const repository = new ConnectionRepository();

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  if (typeof connectionId !== 'string' || connectionId.length === 0) {
    return { body: 'ok', statusCode: 200 };
  }

  try {
    await repository.purgeConnection(connectionId);
  } catch (error: unknown) {
    log('warn', 'Failed to cleanup WebSocket connection', {
      connectionId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  return { body: 'ok', statusCode: 200 };
};
